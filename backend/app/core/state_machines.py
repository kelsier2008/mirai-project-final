"""All allowed status transitions live HERE, in one place.

Why: scattered `if status == ...` checks drift apart and let illegal
transitions slip through. Routers/services call transition() and never
compare statuses themselves.
"""


class InvalidTransition(Exception):
    pass


ENROLMENT = {
    "pending": {"approved", "rejected"},
    "approved": set(),
    "rejected": set(),
}

CLUB_DAY = {
    "planned": {"approved"},
    "approved": {"announced"},
    "announced": {"open"},
    "open": {"submissions"},
    "submissions": {"evaluating"},
    "evaluating": {"closed"},
    "closed": set(),
}


# Club registry approval. An approved club can be unapproved (-> rejected) and a
# rejected club can be approved again; every change is audit-logged.
CLUB_APPROVAL = {
    "pending": {"approved", "rejected"},
    "approved": {"rejected"},
    "rejected": {"approved"},
}

# Activity plan: drafts are private to the club's managers until submitted.
PLAN = {
    "draft": {"draft", "pending"},
    "pending": {"pending", "draft", "approved", "rejected"},
    "rejected": {"draft", "pending"},
    "approved": set(),
}


def transition(machine: dict, current: str, target: str) -> str:
    if target not in machine.get(current, set()):
        raise InvalidTransition(f"Cannot move from '{current}' to '{target}'")
    return target