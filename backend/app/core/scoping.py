"""SQL fragments that limit staff queries to the clubs a user may see.

Each helper returns (condition, value): the condition is written against $1,
so callers pass the value as the first query parameter.
"""


def club_scope(user: dict):
    """Condition on clubs alias c."""
    role = user["role"]
    if role == "super_admin":
        return "$1::bigint IS NOT NULL", 0
    if role == "campus_admin":
        return "c.campus_id = $1::bigint", user["campus_id"]
    if role == "coordinator":
        return "c.id IN (SELECT club_id FROM club_coordinators WHERE user_id = $1::bigint)", user["id"]
    if role == "advisor":
        return "c.advisor_id = $1::bigint", user["id"]
    raise ValueError("club_scope is for staff roles only")


def student_scope(user: dict):
    """Condition on the v_student_stats alias v."""
    role = user["role"]
    if role == "super_admin":
        return "$1::bigint IS NOT NULL", 0
    if role == "campus_admin":
        return "v.campus_id = $1::bigint", user["campus_id"]
    frag, val = club_scope(user)
    return (
        "v.student_id IN (SELECT m.student_id FROM club_memberships m "
        "JOIN clubs c ON c.id = m.club_id "
        f"WHERE m.status = 'approved' AND {frag})"
    ), val
