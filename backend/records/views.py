from rest_framework import viewsets, filters
from rest_framework.decorators import action
from rest_framework.response import Response
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
