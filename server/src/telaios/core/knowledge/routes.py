"""HTTP route extraction from source code.

Uses regex patterns that work across languages without requiring a running parser.
Detects common web framework decorator/annotation patterns and extracts:
  (http_method, route_path, handler_name)
"""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass
class RouteInfo:
    method: str        # GET, POST, PUT, DELETE, PATCH, ANY
    path: str          # /api/users/{id}
    handler: str | None


# ── Python — FastAPI / Flask / Starlette ─────────────────────────────────────
# @router.get("/path")
# @app.post("/path")
# @bp.route("/path", methods=["GET", "POST"])

_PY_DECO = re.compile(
    r'@\w+\.(get|post|put|delete|patch|head|options|route)\s*\(\s*["\']([^"\']+)["\']'
    r'(?:[^)]*methods\s*=\s*\[([^\]]+)\])?',
    re.IGNORECASE,
)
_PY_FUNC = re.compile(r'(?:async\s+)?def\s+(\w+)\s*\(')


# ── Java — Spring MVC ─────────────────────────────────────────────────────────
#
# Handles:
#   @RequestMapping("/prefix") on the class  → base path prefix
#   @GetMapping, @PostMapping, etc. with or without a path argument
#   @RequestMapping(value="/path", method=RequestMethod.GET) on methods
#   extends BaseCrudResource<...>             → infers 7 standard CRUD endpoints

# Class-level @RequestMapping prefix — must be followed by 'class' or 'interface'
# within a reasonable distance (catches both @RestController + @RequestMapping stacks)
_JAVA_CLASS_MAPPING_RE = re.compile(
    r'@RequestMapping\s*\(\s*(?:value\s*=\s*)?["\']([^"\']+)["\'][^)]*\)',
    re.IGNORECASE,
)
_JAVA_CLASS_DECL_RE = re.compile(r'\b(?:class|interface)\b', re.IGNORECASE)

# Method-level @{Verb}Mapping, three forms:
#   @GetMapping("/{id}")     → group(1)=Get,  group(2)=/{id}
#   @GetMapping()            → group(1)=Get,  group(2)=None  (empty parens)
#   @GetMapping              → group(1)=Get,  group(2)=None  (no parens)
_JAVA_VERB_MAPPING_RE = re.compile(
    r'@(Get|Post|Put|Delete|Patch)Mapping\s*'
    r'(?:'
    r'\(\s*(?:value\s*=\s*)?["\']([^"\']*)["\'][^)]*\)'   # ("path") or (value="path")
    r'|\(\s*\)'                                             # ()
    r'|(?=\s*(?:@|\w))'                                    # no parens (followed by next token)
    r')',
    re.IGNORECASE,
)

# Method-level @RequestMapping with explicit method=RequestMethod.XXX
_JAVA_METHOD_REQUEST_MAPPING_RE = re.compile(
    r'@RequestMapping\s*\('
    r'(?:[^)]*?(?:value\s*=\s*["\']([^"\']*)["\'])?)?'
    r'[^)]*?method\s*=\s*RequestMethod\.(\w+)',
    re.IGNORECASE,
)

# Detects known CRUD base class patterns (microservicecore / common internal libs)
_JAVA_CRUD_BASE_RE = re.compile(
    r'\bextends\s+(?:\w+\.)*(?:BaseCrudResource|CrudResource|AbstractCrudController'
    r'|BaseRestController|AbstractRestResource)\b',
    re.IGNORECASE,
)

# Standard CRUD endpoints injected when BaseCrudResource is detected.
# Paths are expressed as suffixes to be combined with the class prefix.
_CRUD_ENDPOINTS: list[tuple[str, str, str]] = [
    ("GET",    "",         "getAll"),
    ("GET",    "/{id}",    "getById"),
    ("POST",   "",         "save"),
    ("POST",   "/search",  "search"),
    ("PUT",    "/{id}",    "update"),
    ("PATCH",  "/{id}",    "patch"),
    ("DELETE", "/{id}",    "delete"),
]


def _java_class_prefix(content: str) -> str:
    """Return the class-level @RequestMapping path prefix, or '' if absent."""
    for m in _JAVA_CLASS_MAPPING_RE.finditer(content):
        # The next 500 chars after the annotation must contain a class/interface decl
        after = content[m.end():m.end() + 500]
        if _JAVA_CLASS_DECL_RE.search(after):
            return m.group(1).rstrip("/")
    return ""


def _combine_paths(prefix: str, suffix: str) -> str:
    prefix = prefix.rstrip("/")
    if not suffix:
        return prefix or "/"
    if not suffix.startswith("/"):
        suffix = "/" + suffix
    return prefix + suffix


def _extract_java_routes(content: str) -> list[RouteInfo]:
    routes: list[RouteInfo] = []
    class_prefix = _java_class_prefix(content)

    # Method-level @{Verb}Mapping
    for m in _JAVA_VERB_MAPPING_RE.finditer(content):
        verb = m.group(1).upper()
        method_path = m.group(2) or ""
        routes.append(RouteInfo(
            method=verb,
            path=_combine_paths(class_prefix, method_path),
            handler=None,
        ))

    # Method-level @RequestMapping(value=..., method=RequestMethod.XXX)
    for m in _JAVA_METHOD_REQUEST_MAPPING_RE.finditer(content):
        method_path = m.group(1) or ""
        verb = m.group(2).upper()
        # Skip if this is the class-level prefix (no explicit method= allowed at class level)
        route_path = _combine_paths(class_prefix, method_path)
        # Avoid duplicate with class-prefix itself
        if route_path != class_prefix:
            routes.append(RouteInfo(method=verb, path=route_path, handler=None))

    # Inherited CRUD endpoints from known base classes
    if _JAVA_CRUD_BASE_RE.search(content):
        for verb, suffix, handler in _CRUD_ENDPOINTS:
            routes.append(RouteInfo(
                method=verb,
                path=_combine_paths(class_prefix, suffix),
                handler=handler,
            ))

    return routes


# ── TypeScript / JavaScript — Express ────────────────────────────────────────
# router.get("/path", handler)
# app.post("/path", handler)

_EXPRESS = re.compile(
    r'\b(?:router|app)\.(get|post|put|delete|patch|head|options)\s*\(\s*["\`]([^"\'`]+)["\`]',
    re.IGNORECASE,
)

# ── TypeScript — NestJS decorators ───────────────────────────────────────────
# @Get("/path")  @Post("/path")  @Delete()

_NEST = re.compile(
    r'@(Get|Post|Put|Delete|Patch|Head|Options)\s*\(\s*["\']([^"\']*)["\']',
    re.IGNORECASE,
)


def extract_routes(content: str, language: str) -> list[RouteInfo]:
    """Extract HTTP route info from source code content."""
    routes: list[RouteInfo] = []
    lines = content.splitlines()

    if language == "python":
        for i, line in enumerate(lines):
            m = _PY_DECO.search(line)
            if not m:
                continue
            verb = m.group(1).upper()
            path = m.group(2)
            raw_methods = m.group(3)

            # Find the function name on the next non-decorator line
            handler = None
            for j in range(i + 1, min(i + 5, len(lines))):
                fm = _PY_FUNC.search(lines[j])
                if fm:
                    handler = fm.group(1)
                    break

            if verb == "ROUTE" and raw_methods:
                for method in re.findall(r'"(\w+)"', raw_methods):
                    routes.append(RouteInfo(method=method.upper(), path=path, handler=handler))
            else:
                routes.append(RouteInfo(method=verb, path=path, handler=handler))

    elif language == "java":
        routes = _extract_java_routes(content)

    elif language in ("typescript", "tsx", "javascript"):
        for m in _EXPRESS.finditer(content):
            routes.append(RouteInfo(method=m.group(1).upper(), path=m.group(2), handler=None))
        for m in _NEST.finditer(content):
            routes.append(RouteInfo(method=m.group(1).upper(), path=m.group(2) or "/", handler=None))

    return routes


def build_file_index(
    source_path: str,
    language: str | None,
    symbol_names: list[tuple[str, str]],  # (name, type)
    routes: list[RouteInfo],
) -> str:
    """Build a natural-language index chunk for a source file.

    This chunk is embedded alongside symbol chunks so broad queries
    ("how many REST APIs?", "list all functions in X") can retrieve
    a file-level overview rather than just individual symbols.
    """
    parts: list[str] = [f"File: {source_path}"]
    if language:
        parts[0] += f" ({language})"

    if symbol_names:
        by_type: dict[str, list[str]] = {}
        for name, stype in symbol_names:
            by_type.setdefault(stype, []).append(name)
        for stype, names in by_type.items():
            parts.append(f"{stype.capitalize()}s ({len(names)}): {', '.join(names)}")

    if routes:
        parts.append(f"REST endpoints ({len(routes)}):")
        for r in routes:
            handler_str = f" → {r.handler}" if r.handler else ""
            parts.append(f"  {r.method} {r.path}{handler_str}")

    return "\n".join(parts)


__all__ = ["RouteInfo", "build_file_index", "extract_routes"]
