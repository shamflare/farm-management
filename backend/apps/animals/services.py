"""Animal lifecycle: registration, status, births, weights, health, timeline."""
from django.core.exceptions import ValidationError
from django.db import transaction

from apps.audit.models import AuditAction
from apps.audit.services import record
from apps.animals.models import (
    Acquisition,
    Animal,
    AnimalEvent,
    AnimalEventType,
    Birth,
    HealthRecord,
    Offspring,
    Sex,
    WeightRecord,
)
from apps.catalog.models import CatalogItem, CatalogTypeCode

# Status codes the lifecycle depends on. The admin may rename them freely;
# only the code is referenced here.
STATUS_ACTIVE = "active"
STATUS_SOLD = "sold"
STATUS_DEAD = "dead"
STATUS_TRANSFERRED = "transferred"


def status_by_code(farm, code):
    status = CatalogItem.objects.filter(
        farm=farm, type_id=CatalogTypeCode.ANIMAL_STATUS, code=code
    ).first()
    if status is None:
        raise LookupError(f"animal status '{code}' is not configured for this farm")
    return status


def next_tag(farm, animal_type=None):
    """Suggest the next visible number so field staff do not have to invent one."""
    prefix = (animal_type.code[:2].upper() + "-") if animal_type else ""
    existing = Animal.all_objects.filter(farm=farm, tag__startswith=prefix).values_list("tag", flat=True)
    top = 0
    for tag in existing:
        suffix = tag[len(prefix):]
        if suffix.isdigit():
            top = max(top, int(suffix))
    return f"{prefix}{top + 1:04d}"


@transaction.atomic
def create_animal(
    farm,
    *,
    animal_type,
    tag=None,
    name="",
    breed=None,
    sex=Sex.UNKNOWN,
    birth_date=None,
    mother=None,
    father=None,
    status=None,
    location=None,
    acquisition=Acquisition.BORN,
    entered_at=None,
    notes="",
    custom_fields=None,
    actor=None,
    **extra
):
    """Register one animal. Money is not touched here - purchases do that."""
    if mother is not None and mother.sex == Sex.MALE:
        raise ValidationError("the mother must be female")
    if father is not None and father.sex == Sex.FEMALE:
        raise ValidationError("the father must be male")
    if mother is not None and mother.farm_id != farm.id:
        raise ValidationError("the mother belongs to another farm")
    if father is not None and father.farm_id != farm.id:
        raise ValidationError("the father belongs to another farm")

    status = status or status_by_code(farm, STATUS_ACTIVE)
    animal = Animal.objects.create(
        farm=farm,
        tag=tag or next_tag(farm, animal_type),
        name=name,
        animal_type=animal_type,
        breed=breed,
        sex=sex,
        birth_date=birth_date,
        mother=mother,
        father=father,
        status=status,
        location=location,
        acquisition=acquisition,
        entered_at=entered_at or birth_date,
        notes=notes,
        **extra,
    )

    if custom_fields:
        from apps.customfields.services import set_values

        set_values(farm, "animal", animal.id, custom_fields)

    AnimalEvent.objects.create(
        farm=farm,
        animal=animal,
        event_type=AnimalEventType.CREATED,
        happened_on=entered_at or birth_date or animal.created_at.date(),
        title="تم تسجيل الحيوان",
        data={"acquisition": acquisition},
    )
    record(
        AuditAction.CREATE,
        "animal",
        animal.id,
        farm=farm,
        label=f"animal {animal.tag}",
        new={"tag": animal.tag, "type": animal_type.name, "sex": sex},
        user=actor,
    )
    return animal


@transaction.atomic
def change_status(animal, status, *, date=None, note="", actor=None):
    """Status changes are recorded, never silent, and never delete anything."""
    old = animal.status
    animal.status = status
    animal.save(update_fields=["status", "updated_at", "updated_by"])
    AnimalEvent.objects.create(
        farm=animal.farm,
        animal=animal,
        event_type=AnimalEventType.STATUS,
        happened_on=date or animal.updated_at.date(),
        title=f"تغيير الحالة إلى {status.display_name}",
        detail=note,
        data={"from": old.code if old else "", "to": status.code},
    )
    record(
        AuditAction.UPDATE,
        "animal",
        animal.id,
        farm=animal.farm,
        label=f"status of {animal.tag}",
        old={"status": old.code if old else ""},
        new={"status": status.code},
        user=actor,
    )
    return animal


def mark_sold(animal, *, date, actor=None):
    animal.is_on_farm = False
    animal.exited_at = date
    animal.save(update_fields=["is_on_farm", "exited_at", "updated_at"])
    return change_status(animal, status_by_code(animal.farm, STATUS_SOLD), date=date, actor=actor)


def mark_dead(animal, *, date, actor=None):
    animal.is_alive = False
    animal.is_on_farm = False
    animal.exited_at = date
    animal.save(update_fields=["is_alive", "is_on_farm", "exited_at", "updated_at"])
    return change_status(animal, status_by_code(animal.farm, STATUS_DEAD), date=date, actor=actor)


@transaction.atomic
def register_birth(
    farm,
    *,
    mother,
    happened_on,
    offspring=None,
    father=None,
    stillborn=0,
    notes="",
    actor=None,
):
    """Record a birthing event and register the newborns in one go.

    `offspring` is a list of dicts accepted by create_animal (sex, tag, name...).
    """
    if mother.sex != Sex.FEMALE:
        raise ValidationError("only a female animal can give birth")
    if mother.farm_id != farm.id:
        raise ValidationError("the mother belongs to another farm")

    offspring = offspring or []
    birth = Birth.objects.create(
        farm=farm,
        mother=mother,
        father=father,
        happened_on=happened_on,
        total_born=len(offspring) + int(stillborn or 0),
        born_alive=len(offspring),
        stillborn=int(stillborn or 0),
        notes=notes,
    )

    created = []
    for spec in offspring:
        baby = create_animal(
            farm,
            animal_type=spec.get("animal_type") or mother.animal_type,
            tag=spec.get("tag"),
            name=spec.get("name", ""),
            breed=spec.get("breed") or mother.breed,
            sex=spec.get("sex", Sex.UNKNOWN),
            birth_date=happened_on,
            mother=mother,
            father=father,
            location=spec.get("location") or mother.location,
            acquisition=Acquisition.BORN,
            entered_at=happened_on,
            custom_fields=spec.get("custom_fields"),
            actor=actor,
        )
        Offspring.objects.create(birth=birth, animal=baby)
        AnimalEvent.objects.create(
            farm=farm,
            animal=baby,
            event_type=AnimalEventType.BORN,
            happened_on=happened_on,
            title="ولادة",
            data={"mother": str(mother.id), "birth_id": str(birth.id)},
        )
        created.append(baby)

    AnimalEvent.objects.create(
        farm=farm,
        animal=mother,
        event_type=AnimalEventType.BIRTH,
        happened_on=happened_on,
        title=f"ولادة {len(created)} مولود",
        detail=notes,
        data={
            "birth_id": str(birth.id),
            "born_alive": len(created),
            "stillborn": int(stillborn or 0),
            "offspring": [str(a.id) for a in created],
        },
    )
    record(
        AuditAction.CREATE,
        "birth",
        birth.id,
        farm=farm,
        label=f"birth from {mother.tag}: {len(created)} alive",
        new={"mother": mother.tag, "alive": len(created), "stillborn": int(stillborn or 0)},
        user=actor,
    )
    return birth, created


@transaction.atomic
def add_weight(animal, *, weight_kg, measured_on, note="", actor=None):
    row, _ = WeightRecord.objects.update_or_create(
        animal=animal,
        measured_on=measured_on,
        defaults={"farm": animal.farm, "weight_kg": weight_kg, "note": note},
    )
    latest = animal.weights.order_by("-measured_on").first()
    if latest is not None and latest.measured_on == measured_on:
        animal.current_weight = weight_kg
        animal.save(update_fields=["current_weight", "updated_at"])
    AnimalEvent.objects.create(
        farm=animal.farm,
        animal=animal,
        event_type=AnimalEventType.WEIGHT,
        happened_on=measured_on,
        title=f"وزن {weight_kg} كغ",
        detail=note,
        data={"weight_kg": str(weight_kg)},
    )
    return row


@transaction.atomic
def add_health_record(
    animal,
    *,
    kind,
    happened_on,
    item=None,
    next_due_on=None,
    dose="",
    veterinarian="",
    cost=None,
    currency=None,
    from_account=None,
    paid_by_party=None,
    notes="",
    actor=None,
):
    """Log a treatment or vaccination, and charge its cost to this animal."""
    entry = None
    if cost:
        from apps.operations.services import record_expense

        entry = record_expense(
            animal.farm,
            date=happened_on,
            amount=cost,
            currency=currency,
            from_account=from_account,
            paid_by_party=paid_by_party,
            memo=f"{kind} - {animal.tag}",
            subject_type="animal",
            subject_id=animal.id,
            actor=actor,
        )

    row = HealthRecord.objects.create(
        farm=animal.farm,
        animal=animal,
        kind=kind,
        item=item,
        happened_on=happened_on,
        next_due_on=next_due_on,
        dose=dose,
        veterinarian=veterinarian,
        cost=cost,
        currency=currency or (animal.farm.base_currency if cost else None),
        journal_entry=entry,
        notes=notes,
    )
    AnimalEvent.objects.create(
        farm=animal.farm,
        animal=animal,
        event_type=(
            AnimalEventType.VACCINE if kind == "vaccine" else AnimalEventType.HEALTH
        ),
        happened_on=happened_on,
        title=item.display_name if item else kind,
        detail=notes,
        amount=cost,
        currency=currency or (animal.farm.base_currency if cost else None),
        journal_entry=entry,
        data={"kind": kind, "next_due_on": str(next_due_on) if next_due_on else ""},
    )
    return row


def timeline(animal, *, limit=200):
    return animal.events.select_related("journal_entry", "currency").order_by(
        "-happened_on", "-created_at"
    )[:limit]


def animal_cost(animal):
    """Purchase price plus every expense ever attributed to this animal."""
    from apps.ledger.services import subject_cost, subject_revenue

    spent = subject_cost(animal.farm, "animal", animal.id)
    earned = subject_revenue(animal.farm, "animal", animal.id)
    return {
        "purchase_price": animal.purchase_price,
        "total_cost": spent,
        "total_revenue": earned,
        "net": earned - spent,
    }


def family_tree(animal, *, depth=3):
    """Ancestors and descendants, kept even for sold or dead animals."""

    def ancestors(node, level):
        if node is None or level > depth:
            return None
        return {
            "id": str(node.id),
            "tag": node.tag,
            "name": node.name,
            "sex": node.sex,
            "mother": ancestors(node.mother, level + 1),
            "father": ancestors(node.father, level + 1),
        }

    children = [
        {
            "id": str(child.id),
            "tag": child.tag,
            "name": child.name,
            "sex": child.sex,
            "birth_date": child.birth_date,
            "status": child.status.display_name if child.status_id else "",
        }
        for child in animal.children()
    ]
    return {"animal": ancestors(animal, 0), "children": children}


def productivity(mother):
    """How many births and how many surviving offspring a female has produced."""
    births = mother.births.all()
    offspring_ids = Offspring.objects.filter(birth__in=births).values_list("animal_id", flat=True)
    offspring = Animal.objects.filter(id__in=offspring_ids)
    return {
        "births": births.count(),
        "total_offspring": offspring.count(),
        "alive": offspring.filter(is_alive=True).count(),
        "on_farm": offspring.filter(is_on_farm=True).count(),
        "stillborn": sum(b.stillborn for b in births),
    }
