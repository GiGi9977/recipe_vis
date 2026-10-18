"""Format check for the optional edge field `heat_level` (see prompt section 16.2).

`heat_level` belongs to PROCESS edges of type "heat". It is either one of
"low" / "middle" / "high", or an ordered object of at least two of those levels
whose values are fractions between 0 and 1 that sum to 1.0. The check only
validates the format; it never infers or rewrites a level.
"""

HEAT_LEVELS = ("low", "middle", "high")
SUM_TOLERANCE = 0.011  # two-decimal rounding of several shares


def _is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def heat_level_errors(edges):
    errors = []
    for edge in edges:
        if "heat_level" not in edge:
            continue
        index = edge.get("index")
        value = edge["heat_level"]

        if str(edge.get("action", "")).lower().strip() == "add":
            errors.append(f"Edge {index}: heat_level is not allowed on an ADD edge")
            continue
        if str(edge.get("action", "")).lower().strip() == "split":
            errors.append(f"Edge {index}: heat_level is not allowed on a split edge")
            continue
        if str(edge.get("type", "")).lower().strip() != "heat":
            errors.append(f"Edge {index}: heat_level is only allowed on PROCESS edges of type heat")
            continue

        if isinstance(value, str):
            if value not in HEAT_LEVELS:
                errors.append(f"Edge {index}: heat_level '{value}' is not one of {list(HEAT_LEVELS)}")
        elif isinstance(value, dict):
            if len(value) < 2:
                errors.append(f"Edge {index}: a single heat level must be a string, not an object")
                continue
            bad_keys = [key for key in value if key not in HEAT_LEVELS]
            if bad_keys:
                errors.append(f"Edge {index}: heat_level has unknown levels {bad_keys}")
                continue
            if not all(_is_number(share) and 0 <= share <= 1 for share in value.values()):
                errors.append(f"Edge {index}: heat_level shares must be numbers between 0 and 1")
                continue
            if abs(sum(value.values()) - 1.0) > SUM_TOLERANCE:
                errors.append(f"Edge {index}: heat_level shares must sum to 1.0")
        else:
            errors.append(f"Edge {index}: heat_level must be a level string or an object of shares")
    return errors
