from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import CalendarEvent
from .serializers import CalendarEventSerializer
from swimmers.models import Swimmer


class CalendarEventViewSet(viewsets.ModelViewSet):
    queryset = CalendarEvent.objects.all()
    serializer_class = CalendarEventSerializer
    pagination_class = None

    def get_queryset(self):
        qs = super().get_queryset()
        month = self.request.query_params.get('month')
        year = self.request.query_params.get('year')
        if month and year:
            qs = qs.filter(date__month=int(month), date__year=int(year))
        return qs

    @action(detail=False, methods=['get'], url_path='month-summary')
    def month_summary(self, request):
        month = request.query_params.get('month')
        year = request.query_params.get('year')
        if not month or not year:
            return Response({'error': 'month and year required'}, status=400)
        month, year = int(month), int(year)
        events = CalendarEvent.objects.filter(date__month=month, date__year=year)
        swimmers = Swimmer.objects.filter(date_of_birth__month=month).select_related('nationality')
        birthdays = []
        for s in swimmers:
            birthdays.append({
                'id': s.id,
                'name': s.name,
                'day': s.date_of_birth.day,
                'date_of_birth': s.date_of_birth,
                'age': s.age,
                'photo': s.photo.url if s.photo else None,
            })
        return Response({
            'total_events': events.count(),
            'birthdays_count': len(birthdays),
            'birthdays': birthdays,
            'events': CalendarEventSerializer(events, many=True).data,
        })
