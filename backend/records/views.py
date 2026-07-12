from rest_framework import viewsets, filters
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db.models import Min, F
from .models import Record
from .serializers import RecordSerializer, RecordCreateSerializer


class RecordViewSet(viewsets.ModelViewSet):
    queryset = Record.objects.select_related('swimmer', 'swimmer__nationality', 'event')
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['swimmer__name']
    ordering_fields = ['result_date', 'time_centiseconds']

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return RecordCreateSerializer
        return RecordSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        record_type = self.request.query_params.get('record_type')
        event = self.request.query_params.get('event')
        is_new = self.request.query_params.get('is_new')
        if record_type:
            qs = qs.filter(record_type=record_type)
        if event:
            qs = qs.filter(event_id=event)
        if is_new is not None:
            qs = qs.filter(is_new=is_new.lower() == 'true')
        return qs

    @action(detail=False, methods=['get'])
    def new(self, request):
        records = self.get_queryset().filter(is_new=True)
        page = self.paginate_queryset(records)
        if page is not None:
            serializer = RecordSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = RecordSerializer(records, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def computed(self, request):
        """Return the fastest time per event+gender from existing Result data.

        Query params:
          scope           – national, arab, gcc (default: arab)
          country         – country id (required when scope=national)
          classification  – filter championships by Classification id
          sub_classification – filter by SubClassification id
          pool            – LCM or SCM (default: LCM)
          gender          – M or F (omit for both)
          age_group       – e.g. U10..U17, OPEN (default: OPEN)
        """
        from championships.models import Result, Championship
        from core.models import Event
        from swimmers.models import Swimmer

        pool = request.query_params.get('pool', 'LCM')
        classification = request.query_params.get('classification')
        sub_classification = request.query_params.get('sub_classification')
        gender = request.query_params.get('gender')
        scope = request.query_params.get('scope', 'arab')
        country = request.query_params.get('country')
        age_group = request.query_params.get('age_group')

        # Build base queryset: valid timed results from championships
        qs = Result.objects.filter(
            championship__pool=pool,
            time_centiseconds__gt=0,
            swimmer__is_relay_team=False,
        ).exclude(
            swimmer__nationality__region='OTHER',
        ).select_related(
            'swimmer', 'swimmer__nationality', 'event', 'championship',
            'championship__country',
        )

        # Scope filter
        if scope == 'national' and country:
            qs = qs.filter(swimmer__nationality_id=country)
        elif scope == 'gcc':
            qs = qs.filter(swimmer__nationality__region='GCC')
        else:  # arab (default)
            qs = qs.filter(swimmer__nationality__region__in=['ARAB', 'GCC'])

        if classification:
            qs = qs.filter(championship__classification_id=classification)
        if sub_classification:
            qs = qs.filter(championship__sub_classification_id=sub_classification)
        if gender:
            qs = qs.filter(swimmer__sex=gender)

        # Age group filter
        if age_group and age_group != 'OPEN':
            try:
                max_age = int(age_group.replace('U', ''))
                qs = qs.filter(age_at_competition__lt=max_age)
            except (ValueError, AttributeError):
                pass

        # For each (event, gender): find the minimum time
        best_per_event = (
            qs.values('event_id', 'swimmer__sex')
            .annotate(best_time=Min('time_centiseconds'))
        )

        # Now fetch the actual result rows that match those bests
        records = []
        for entry in best_per_event:
            result = (
                qs.filter(
                    event_id=entry['event_id'],
                    swimmer__sex=entry['swimmer__sex'],
                    time_centiseconds=entry['best_time'],
                )
                .order_by('championship__date')
                .first()
            )
            if result:
                cs = result.time_centiseconds
                minutes = cs // 6000
                seconds = (cs % 6000) // 100
                centis = cs % 100
                if minutes:
                    time_str = f'{minutes}:{seconds:02d}.{centis:02d}'
                else:
                    time_str = f'{seconds}.{centis:02d}'

                records.append({
                    'event_id': result.event_id,
                    'event_name': result.event.name,
                    'event_distance': result.event.distance,
                    'event_sort_order': result.event.sort_order,
                    'is_relay': result.event.is_relay,
                    'gender': result.swimmer.sex,
                    'swimmer_name': result.swimmer.name,
                    'swimmer_id': result.swimmer_id,
                    'nationality': result.swimmer.nationality.name if result.swimmer.nationality else '',
                    'nationality_code': result.swimmer.nationality.code if result.swimmer.nationality else '',
                    'nationality_flag': result.swimmer.nationality.flag_url if result.swimmer.nationality else '',
                    'time': time_str,
                    'time_centiseconds': result.time_centiseconds,
                    'fina_points': result.fina_points,
                    'championship_name': result.championship.name,
                    'championship_country': result.championship.country.name if result.championship.country else '',
                    'championship_country_code': result.championship.country.code if result.championship.country else '',
                    'championship_country_flag': result.championship.country.flag_url if result.championship.country else '',
                    'date': result.championship.date.isoformat(),
                })

        # Sort by event sort_order then distance
        records.sort(key=lambda r: (r['gender'], r['event_sort_order'], r['event_distance']))
        return Response(records)
