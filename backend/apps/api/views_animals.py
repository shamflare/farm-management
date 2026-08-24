"""Animal endpoints: registry, lineage, births, weights, health, timeline."""
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Count, Q
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.animals import services as animal_services
from apps.animals.models import Animal, Birth, HealthRecord, WeightRecord
from apps.api.mixins import FarmScopedViewSet, ok
from apps.api.serializers import (
    AnimalEventSerializer,
    BranchChangeSerializer,
    AnimalListSerializer,
    AnimalSerializer,
    BirthCommandSerializer,
    BirthSerializer,
    HealthRecordSerializer,
    WeightRecordSerializer,
)
from apps.catalog.models import CatalogItem
from apps.customfields.services import get_values, set_values
from apps.ledger.models import Account
from apps.parties.models import Party


def lookup(model, farm, value, field="id"):
    if not value:
        return None
    obj = model.objects.filter(farm=farm, **{field: value}).first()
    if obj is None:
        raise ValidationError({field: f"{model.__name__} '{value}' was not found in this farm"})
    return obj


class AnimalViewSet(FarmScopedViewSet):
    queryset = (
        Animal.objects.select_related(
            "animal_type", "branch", "breed", "status", "location", "mother", "father"
        )
        # صفقة الشراء تُعرض في القائمة، فتُجلب معها: بلا هذا السطر يصير كل صف
        # استعلامين، وستون رأسًا تعني مئة وعشرين استعلامًا في فتح واحد.
        .prefetch_related("purchase_items__purchase__supplier")
        .all()
    )
    filterset_fields = {
        "animal_type": ["exact"],
        "branch": ["exact"],
        "breed": ["exact"],
        "status": ["exact"],
        "location": ["exact"],
        "sex": ["exact"],
        "is_alive": ["exact"],
        "is_on_farm": ["exact"],
        "acquisition": ["exact"],
        "mother": ["exact"],
        "father": ["exact"],
        "birth_date": ["gte", "lte", "exact"],
        "entered_at": ["gte", "lte"],
    }
    search_fields = ["tag", "name", "ear_tag", "chip_number", "barcode"]
    ordering_fields = ["tag", "birth_date", "created_at", "current_weight"]
    audit_entity = "animal"
    audit_fields = ("tag", "name", "sex", "branch", "status", "location", "current_weight")
    required_permissions = {
        "list": "animals.view",
        "retrieve": "animals.view",
        "create": "animals.create",
        "update": "animals.edit",
        "partial_update": "animals.edit",
        "move_branch": "animals.edit",
        "destroy": "animals.delete",
        "default": "animals.view",
    }

    def get_serializer_class(self):
        return AnimalListSerializer if self.action == "list" else AnimalSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        custom = data.pop("custom_fields", None)
        try:
            animal = animal_services.create_animal(
                self.farm,
                animal_type=data.pop("animal_type"),
                custom_fields=custom,
                actor=request.user,
                **{k: v for k, v in data.items() if k not in ("farm",)},
            )
        except DjangoValidationError as exc:
            raise ValidationError(exc.message_dict if hasattr(exc, "message_dict") else str(exc))
        return Response(self.get_serializer(animal).data, status=201)

    def retrieve(self, request, *args, **kwargs):
        animal = self.get_object()
        data = self.get_serializer(animal).data
        data["custom_fields"] = get_values(self.farm, "animal", animal.id)
        return Response(data)

    def perform_update(self, serializer):
        custom = serializer.validated_data.pop("custom_fields", None)
        instance = super().perform_update(serializer)
        if custom:
            try:
                set_values(self.farm, "animal", serializer.instance.id, custom)
            except DjangoValidationError as exc:
                raise ValidationError(exc.message_dict if hasattr(exc, "message_dict") else str(exc))
        return instance

    @action(detail=True, methods=["post"], url_path="branch")
    def move_branch(self, request, pk=None):
        """Move one animal between branches, leaving a trace on its timeline."""
        animal = self.get_object()
        serializer = BranchChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        branch = lookup(CatalogItem, self.farm, data.get("branch"))
        try:
            animal_services.change_branch(
                animal,
                branch,
                date=data.get("date"),
                note=data.get("note", ""),
                actor=request.user,
            )
        except DjangoValidationError as exc:
            raise ValidationError(exc.message_dict if hasattr(exc, "message_dict") else str(exc))
        return ok(AnimalSerializer(animal).data)

    @action(detail=True, methods=["get"])
    def timeline(self, request, pk=None):
        animal = self.get_object()
        events = animal_services.timeline(animal)
        return ok({"events": AnimalEventSerializer(events, many=True).data})

    @action(detail=True, methods=["get"], url_path="family-tree")
    def family_tree(self, request, pk=None):
        return ok(animal_services.family_tree(self.get_object()))

    @action(detail=True, methods=["get"])
    def cost(self, request, pk=None):
        return ok(animal_services.animal_cost(self.get_object()))

    @action(detail=True, methods=["get"])
    def productivity(self, request, pk=None):
        return ok(animal_services.productivity(self.get_object()))

    @action(detail=True, methods=["post"], url_path="weight")
    def add_weight(self, request, pk=None):
        animal = self.get_object()
        serializer = WeightRecordSerializer(data={**request.data, "animal": str(animal.id)})
        serializer.is_valid(raise_exception=True)
        row = animal_services.add_weight(
            animal,
            weight_kg=serializer.validated_data["weight_kg"],
            measured_on=serializer.validated_data["measured_on"],
            note=serializer.validated_data.get("note", ""),
            actor=request.user,
        )
        return ok(WeightRecordSerializer(row).data)

    @action(detail=True, methods=["post"], url_path="health")
    def add_health(self, request, pk=None):
        animal = self.get_object()
        payload = request.data
        row = animal_services.add_health_record(
            animal,
            kind=payload.get("kind", "treatment"),
            happened_on=payload["happened_on"],
            item=lookup(CatalogItem, self.farm, payload.get("item")),
            next_due_on=payload.get("next_due_on") or None,
            dose=payload.get("dose", ""),
            veterinarian=payload.get("veterinarian", ""),
            cost=payload.get("cost") or None,
            from_account=lookup(Account, self.farm, payload.get("from_account")),
            paid_by_party=lookup(Party, self.farm, payload.get("paid_by_party")),
            notes=payload.get("notes", ""),
            actor=request.user,
        )
        return ok(HealthRecordSerializer(row).data)

    @action(detail=True, methods=["post"], url_path="status")
    def set_status(self, request, pk=None):
        animal = self.get_object()
        status_item = lookup(CatalogItem, self.farm, request.data.get("status"))
        if status_item is None:
            raise ValidationError({"status": "required"})
        animal_services.change_status(
            animal,
            status_item,
            date=request.data.get("date"),
            note=request.data.get("note", ""),
            actor=request.user,
        )
        return ok(AnimalSerializer(animal).data)

    @action(detail=False, methods=["get"], url_path="next-tag")
    def next_tag(self, request):
        """The number the next animal of this type, in this branch, should carry."""
        farm = self.farm
        animal_type = lookup(CatalogItem, farm, request.query_params.get("animal_type"))
        branch = lookup(CatalogItem, farm, request.query_params.get("branch"))
        return ok({"tag": animal_services.next_tag(farm, animal_type, branch)})

    @action(detail=False, methods=["get"])
    def summary(self, request):
        """Headline counts for the dashboard, in one query per grouping."""
        qs = self.get_queryset()
        by_status = list(
            qs.values("status__code", "status__name_ar").annotate(count=Count("id")).order_by()
        )
        by_type = list(
            qs.values("animal_type__code", "animal_type__name_ar").annotate(count=Count("id")).order_by()
        )
        return ok(
            {
                "total": qs.count(),
                "on_farm": qs.filter(is_on_farm=True).count(),
                "females": qs.filter(sex="female", is_on_farm=True).count(),
                "males": qs.filter(sex="male", is_on_farm=True).count(),
                "sold": qs.filter(status__code="sold").count(),
                "dead": qs.filter(status__code="dead").count(),
                "by_status": by_status,
                "by_type": by_type,
            }
        )


class BirthViewSet(FarmScopedViewSet):
    queryset = Birth.objects.select_related("mother", "father").prefetch_related("offspring__animal")
    serializer_class = BirthSerializer
    filterset_fields = ["mother", "father", "happened_on"]
    ordering_fields = ["happened_on"]
    audit_entity = "birth"
    required_permissions = {
        "list": "births.view",
        "retrieve": "births.view",
        "create": "births.create",
        "default": "births.edit",
    }

    def create(self, request, *args, **kwargs):
        """Register the birth and its newborns together."""
        command = BirthCommandSerializer(data=request.data)
        command.is_valid(raise_exception=True)
        data = command.validated_data

        mother = lookup(Animal, self.farm, data["mother"])
        father = lookup(Animal, self.farm, data.get("father"))
        offspring = []
        for spec in data.get("offspring", []):
            offspring.append(
                {
                    "sex": spec.get("sex", "unknown"),
                    "tag": spec.get("tag"),
                    "name": spec.get("name", ""),
                    "breed": lookup(CatalogItem, self.farm, spec.get("breed")),
                    "animal_type": lookup(CatalogItem, self.farm, spec.get("animal_type")),
                    "location": lookup(CatalogItem, self.farm, spec.get("location")),
                    "custom_fields": spec.get("custom_fields"),
                }
            )
        try:
            birth, lambs = animal_services.register_birth(
                self.farm,
                mother=mother,
                father=father,
                happened_on=data["happened_on"],
                offspring=offspring,
                stillborn=data.get("stillborn", 0),
                notes=data.get("notes", ""),
                actor=request.user,
            )
        except DjangoValidationError as exc:
            raise ValidationError(exc.message_dict if hasattr(exc, "message_dict") else str(exc))

        return Response(
            {
                "birth": BirthSerializer(birth).data,
                "offspring": AnimalListSerializer(lambs, many=True).data,
            },
            status=201,
        )


class WeightViewSet(FarmScopedViewSet):
    queryset = WeightRecord.objects.select_related("animal").all()
    serializer_class = WeightRecordSerializer
    filterset_fields = ["animal", "measured_on"]
    required_permissions = {
        "list": "animals.view",
        "retrieve": "animals.view",
        "default": "animals.edit",
    }


class HealthViewSet(FarmScopedViewSet):
    queryset = HealthRecord.objects.select_related("animal", "item").all()
    serializer_class = HealthRecordSerializer
    filterset_fields = ["animal", "kind", "item", "happened_on", "next_due_on"]
    ordering_fields = ["happened_on", "next_due_on"]
    required_permissions = {
        "list": "health.view",
        "retrieve": "health.view",
        "create": "health.create",
        "default": "health.edit",
    }

    @action(detail=False, methods=["get"])
    def due(self, request):
        """Vaccinations and treatments coming up - drives notifications."""
        from django.utils import timezone

        horizon = int(request.query_params.get("days", 14))
        today = timezone.now().date()
        rows = self.get_queryset().filter(
            next_due_on__isnull=False, next_due_on__lte=today + timezone.timedelta(days=horizon)
        ).order_by("next_due_on")
        return ok({"count": rows.count(), "records": HealthRecordSerializer(rows, many=True).data})
