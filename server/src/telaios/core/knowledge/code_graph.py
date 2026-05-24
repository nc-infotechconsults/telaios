"""Deterministic AST-based code entity extraction for knowledge graphs.

Extracts typed entities (classes, methods, fields, REST endpoints) directly from
source code via tree-sitter — no LLM, no hallucination, no character-window loss.

Supported languages: Java (others extensible via CodeGraphExtractor).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger(__name__)

_SPRING_HTTP_ANNOTATIONS: dict[str, str] = {
    "GetMapping": "GET",
    "PostMapping": "POST",
    "PutMapping": "PUT",
    "DeleteMapping": "DELETE",
    "PatchMapping": "PATCH",
}

_PRIMITIVE_TYPES = frozenset({
    "void", "int", "long", "short", "byte", "char", "float", "double", "boolean",
    "String", "Integer", "Long", "Short", "Byte", "Character", "Float", "Double",
    "Boolean", "Object", "Number",
})

_STOPWORDS_PASCAL = frozenset({
    "REST", "API", "HTTP", "GET", "POST", "PUT", "DELETE", "PATCH",
    "URL", "URI", "JSON", "XML", "SQL",
})


# ── Entity dataclasses ────────────────────────────────────────────────────────

@dataclass
class ClassInfo:
    name: str
    package: str
    file_path: str
    is_abstract: bool = False
    is_interface: bool = False
    is_enum: bool = False
    superclass: str | None = None
    interfaces: list[str] = field(default_factory=list)
    annotations: list[str] = field(default_factory=list)
    component_type: str | None = None  # "controller" | "service" | "repository" | "component"

    @property
    def qualified_name(self) -> str:
        return f"{self.package}.{self.name}" if self.package else self.name


@dataclass
class MethodInfo:
    class_name: str
    name: str
    return_type: str
    params: list[tuple[str, str]] = field(default_factory=list)  # (type, name)
    annotations: list[str] = field(default_factory=list)
    annotation_values: dict[str, str] = field(default_factory=dict)
    visibility: str = "package"
    is_static: bool = False
    request_body_type: str | None = None
    http_method: str | None = None
    http_path: str | None = None


@dataclass
class FieldInfo:
    class_name: str
    name: str
    field_type: str
    visibility: str = "package"
    is_static: bool = False
    is_autowired: bool = False


@dataclass
class ImportInfo:
    importing_class: str
    imported_fqn: str

    @property
    def simple_name(self) -> str:
        return self.imported_fqn.rsplit(".", 1)[-1]


@dataclass
class RestEndpointInfo:
    http_method: str
    path: str
    handler_class: str
    handler_method: str
    request_body_type: str | None = None
    response_type: str | None = None


@dataclass
class CodeEntities:
    file_path: str
    classes: list[ClassInfo] = field(default_factory=list)
    methods: list[MethodInfo] = field(default_factory=list)
    fields: list[FieldInfo] = field(default_factory=list)
    imports: list[ImportInfo] = field(default_factory=list)
    endpoints: list[RestEndpointInfo] = field(default_factory=list)

    def is_empty(self) -> bool:
        return not (self.classes or self.methods or self.fields or self.endpoints)


# ── Java AST extractor ────────────────────────────────────────────────────────

class JavaAstExtractor:
    """Extracts typed code entities from Java source via tree-sitter."""

    _parser: object = None

    @classmethod
    def _get_parser(cls) -> object:
        if cls._parser is None:
            from tree_sitter import Language, Parser  # type: ignore[import]
            import tree_sitter_java as _m  # type: ignore[import]
            cls._parser = Parser(Language(_m.language()))
        return cls._parser

    def extract(self, source: str, file_path: str) -> CodeEntities:
        try:
            return self._do_extract(source, file_path)
        except Exception as exc:
            logger.warning("JavaAstExtractor failed for %s: %s", file_path, exc)
            return CodeEntities(file_path=file_path)

    def _do_extract(self, source: str, file_path: str) -> CodeEntities:
        parser = self._get_parser()
        src = source.encode("utf-8", errors="replace")
        root = parser.parse(src).root_node  # type: ignore[union-attr]
        entities = CodeEntities(file_path=file_path)

        def txt(node: object) -> str:
            return src[node.start_byte:node.end_byte].decode("utf-8", errors="replace")  # type: ignore[attr-defined]

        # Package declaration
        package = ""
        for child in root.children:
            if child.type == "package_declaration":
                for nc in child.children:
                    if nc.type in ("scoped_identifier", "identifier"):
                        package = txt(nc)
                        break

        # Import declarations (attributed to classes after extraction)
        raw_imports: list[str] = []
        for child in root.children:
            if child.type == "import_declaration":
                is_static = False
                for nc in child.children:
                    if nc.type == "static":
                        is_static = True
                    elif nc.type == "scoped_identifier" and not is_static:
                        raw_imports.append(txt(nc))
                        break

        # Top-level type declarations
        for child in root.children:
            if child.type in ("class_declaration", "interface_declaration", "enum_declaration"):
                cls_info = self._extract_class(child, package, file_path, src, txt, entities)
                if cls_info:
                    for fqn in raw_imports:
                        entities.imports.append(ImportInfo(
                            importing_class=cls_info.name,
                            imported_fqn=fqn,
                        ))

        return entities

    def _extract_class(
        self,
        node: object,
        package: str,
        file_path: str,
        src: bytes,
        txt: object,
        entities: CodeEntities,
    ) -> ClassInfo | None:
        is_interface = node.type == "interface_declaration"  # type: ignore[union-attr]
        is_enum = node.type == "enum_declaration"  # type: ignore[union-attr]
        name: str | None = None
        annotations: list[str] = []
        annotation_values: dict[str, str] = {}
        is_abstract = False
        superclass: str | None = None
        interfaces: list[str] = []

        for child in node.children:  # type: ignore[union-attr]
            if child.type == "modifiers":
                for mc in child.children:
                    if mc.type in ("annotation", "marker_annotation"):
                        ann_name, ann_val = self._extract_annotation(mc, src, txt)
                        if ann_name:
                            annotations.append(ann_name)
                            if ann_val:
                                annotation_values[ann_name] = ann_val
                    elif txt(mc) == "abstract":  # type: ignore[operator]
                        is_abstract = True
            elif child.type == "identifier":
                name = txt(child)  # type: ignore[operator]
            elif child.type == "superclass":
                for sc in child.children:
                    if sc.type in ("type_identifier", "generic_type", "scoped_type_identifier"):
                        superclass = self._extract_type_name(sc, src, txt)
                        break
            elif child.type == "super_interfaces":
                for ic in child.children:
                    if ic.type in ("interface_type_list", "type_list"):
                        for itc in ic.children:
                            t = self._extract_type_name(itc, src, txt)
                            if t:
                                interfaces.append(t)
                    elif ic.type in ("type_identifier", "generic_type"):
                        # Some grammar versions place type directly under super_interfaces
                        t = self._extract_type_name(ic, src, txt)
                        if t:
                            interfaces.append(t)

        if not name:
            return None

        component_type: str | None = None
        for ann in annotations:
            if ann in ("RestController", "Controller"):
                component_type = "controller"
            elif ann == "Service" and not component_type:
                component_type = "service"
            elif ann == "Repository" and not component_type:
                component_type = "repository"
            elif ann == "Component" and not component_type:
                component_type = "component"

        cls_info = ClassInfo(
            name=name,
            package=package,
            file_path=file_path,
            is_abstract=is_abstract,
            is_interface=is_interface,
            is_enum=is_enum,
            superclass=superclass,
            interfaces=interfaces,
            annotations=annotations,
            component_type=component_type,
        )
        entities.classes.append(cls_info)

        # Class-level @RequestMapping prefix
        class_http_prefix = annotation_values.get("RequestMapping", "")

        # Body members
        for child in node.children:  # type: ignore[union-attr]
            if child.type in ("class_body", "interface_body", "enum_body"):
                for member in child.children:
                    if member.type == "field_declaration":
                        self._extract_field(member, name, src, txt, entities)
                    elif member.type in ("method_declaration", "constructor_declaration"):
                        self._extract_method(member, name, class_http_prefix, src, txt, entities)
                break

        return cls_info

    def _extract_field(
        self,
        node: object,
        class_name: str,
        src: bytes,
        txt: object,
        entities: CodeEntities,
    ) -> None:
        field_type: str | None = None
        field_name: str | None = None
        visibility = "package"
        is_static = False
        is_autowired = False

        for child in node.children:  # type: ignore[union-attr]
            if child.type == "modifiers":
                for mc in child.children:
                    if mc.type in ("annotation", "marker_annotation"):
                        ann_name, _ = self._extract_annotation(mc, src, txt)
                        if ann_name in ("Autowired", "Inject"):
                            is_autowired = True
                    elif txt(mc) in ("public", "protected", "private"):  # type: ignore[operator]
                        visibility = txt(mc)  # type: ignore[operator]
                    elif txt(mc) == "static":  # type: ignore[operator]
                        is_static = True
            elif child.type in (
                "type_identifier", "generic_type", "array_type",
                "scoped_type_identifier", "type_type",
            ):
                field_type = self._extract_type_name(child, src, txt)
            elif child.type == "variable_declarator_list":
                for vc in child.children:
                    if vc.type == "variable_declarator":
                        for nc in vc.children:
                            if nc.type == "identifier":
                                field_name = txt(nc)  # type: ignore[operator]
                                break
                        if field_name:
                            break
            elif child.type == "variable_declarator":
                # Direct child (not wrapped in list) — common in some grammar versions
                for nc in child.children:
                    if nc.type == "identifier":
                        field_name = txt(nc)  # type: ignore[operator]
                        break

        if field_type and field_name:
            entities.fields.append(FieldInfo(
                class_name=class_name,
                name=field_name,
                field_type=field_type,
                visibility=visibility,
                is_static=is_static,
                is_autowired=is_autowired,
            ))

    def _extract_method(
        self,
        node: object,
        class_name: str,
        class_http_prefix: str,
        src: bytes,
        txt: object,
        entities: CodeEntities,
    ) -> None:
        method_name: str | None = None
        return_type = "void"
        annotations: list[str] = []
        annotation_values: dict[str, str] = {}
        visibility = "package"
        is_static = False
        params: list[tuple[str, str]] = []
        request_body_type: str | None = None

        for child in node.children:  # type: ignore[union-attr]
            if child.type == "modifiers":
                for mc in child.children:
                    if mc.type in ("annotation", "marker_annotation"):
                        ann_name, ann_val = self._extract_annotation(mc, src, txt)
                        if ann_name:
                            annotations.append(ann_name)
                            if ann_val:
                                annotation_values[ann_name] = ann_val
                    elif txt(mc) in ("public", "protected", "private"):  # type: ignore[operator]
                        visibility = txt(mc)  # type: ignore[operator]
                    elif txt(mc) == "static":  # type: ignore[operator]
                        is_static = True
            elif child.type == "identifier":
                method_name = txt(child)  # type: ignore[operator]
            elif child.type in (
                "type_identifier", "generic_type", "array_type",
                "void_type", "scoped_type_identifier", "type_type",
                "integral_type", "floating_point_type", "boolean_type",
            ):
                return_type = self._extract_type_name(child, src, txt) or "void"
            elif child.type == "formal_parameters":
                params, request_body_type = self._extract_params(child, src, txt)

        if not method_name:
            return

        http_method: str | None = None
        http_path: str | None = None

        for ann in annotations:
            if ann in _SPRING_HTTP_ANNOTATIONS:
                http_method = _SPRING_HTTP_ANNOTATIONS[ann]
                method_suffix = annotation_values.get(ann, "")
                http_path = _combine_paths(class_http_prefix, method_suffix)
                break
            elif ann == "RequestMapping":
                http_method = "REQUEST"
                method_suffix = annotation_values.get("RequestMapping", "")
                http_path = _combine_paths(class_http_prefix, method_suffix)
                break

        entities.methods.append(MethodInfo(
            class_name=class_name,
            name=method_name,
            return_type=return_type,
            params=params,
            annotations=annotations,
            annotation_values=annotation_values,
            visibility=visibility,
            is_static=is_static,
            request_body_type=request_body_type,
            http_method=http_method,
            http_path=http_path,
        ))

        if http_method and http_path:
            effective_response = return_type if return_type not in ("void", "ResponseEntity") else None
            entities.endpoints.append(RestEndpointInfo(
                http_method=http_method,
                path=http_path,
                handler_class=class_name,
                handler_method=method_name,
                request_body_type=request_body_type,
                response_type=effective_response,
            ))

    def _extract_params(
        self,
        node: object,
        src: bytes,
        txt: object,
    ) -> tuple[list[tuple[str, str]], str | None]:
        params: list[tuple[str, str]] = []
        request_body_type: str | None = None

        for child in node.children:  # type: ignore[union-attr]
            if child.type == "formal_parameter":
                param_type: str | None = None
                param_name: str | None = None
                has_request_body = False

                for pc in child.children:
                    if pc.type == "modifiers":
                        for mc in pc.children:
                            if mc.type in ("annotation", "marker_annotation"):
                                ann_name, _ = self._extract_annotation(mc, src, txt)
                                if ann_name == "RequestBody":
                                    has_request_body = True
                    elif pc.type in (
                        "type_identifier", "generic_type", "array_type",
                        "scoped_type_identifier", "type_type",
                    ):
                        param_type = self._extract_type_name(pc, src, txt)
                    elif pc.type == "variable_declarator_id":
                        for nc in pc.children:
                            if nc.type == "identifier":
                                param_name = txt(nc)  # type: ignore[operator]
                    elif pc.type == "identifier" and param_type is not None:
                        # Direct identifier child after the type — this is the variable name
                        param_name = txt(pc)  # type: ignore[operator]

                if param_type and param_name:
                    params.append((param_type, param_name))
                    if has_request_body:
                        request_body_type = param_type

        return params, request_body_type

    def _extract_annotation(
        self,
        node: object,
        src: bytes,
        txt: object,
    ) -> tuple[str, str | None]:
        """Handle both `annotation` (@Foo("val")) and `marker_annotation` (@Foo) nodes."""
        ann_name: str | None = None
        ann_value: str | None = None

        if node.type == "marker_annotation":  # type: ignore[union-attr]
            # @Foo — no arguments, name is a direct child identifier
            for child in node.children:  # type: ignore[union-attr]
                if child.type in ("identifier", "scoped_type_identifier"):
                    raw = txt(child)  # type: ignore[operator]
                    ann_name = raw.rsplit(".", 1)[-1]
                    break
            return ann_name or "", None

        for child in node.children:  # type: ignore[union-attr]
            if child.type in ("identifier", "scoped_type_identifier"):
                raw = txt(child)  # type: ignore[operator]
                ann_name = raw.rsplit(".", 1)[-1]
            elif child.type == "annotation_argument_list":
                for ac in child.children:
                    if ac.type == "string_literal":
                        ann_value = txt(ac).strip('"').strip("'")  # type: ignore[operator]
                        break
                    elif ac.type == "element_value_pair":
                        key_ok = False
                        for evc in ac.children:
                            if evc.type == "identifier" and txt(evc) == "value":  # type: ignore[operator]
                                key_ok = True
                            elif evc.type == "string_literal":
                                if key_ok or ann_value is None:
                                    ann_value = txt(evc).strip('"').strip("'")  # type: ignore[operator]

        return ann_name or "", ann_value

    def _extract_type_name(self, node: object, src: bytes, txt: object) -> str | None:
        t = node.type  # type: ignore[union-attr]
        if t == "type_identifier":
            return txt(node)  # type: ignore[operator]
        elif t == "scoped_type_identifier":
            return txt(node).rsplit(".", 1)[-1]  # type: ignore[operator]
        elif t == "generic_type":
            for child in node.children:  # type: ignore[union-attr]
                if child.type in ("type_identifier", "scoped_type_identifier"):
                    return self._extract_type_name(child, src, txt)
        elif t == "array_type":
            for child in node.children:  # type: ignore[union-attr]
                if child.type not in ("[]", "[", "]"):
                    return self._extract_type_name(child, src, txt)
        elif t == "void_type":
            return "void"
        elif t in ("integral_type", "floating_point_type", "boolean_type"):
            return txt(node)  # type: ignore[operator]
        elif t == "type_type":
            for child in node.children:  # type: ignore[union-attr]
                result = self._extract_type_name(child, src, txt)
                if result:
                    return result
        return None


# ── Dispatcher ────────────────────────────────────────────────────────────────

class CodeGraphExtractor:
    """Language-aware dispatcher for deterministic code entity extraction."""

    _SUPPORTED: dict[str, type] = {
        "java": JavaAstExtractor,
    }

    @classmethod
    def supports(cls, language: str) -> bool:
        return language.lower() in cls._SUPPORTED

    def extract(self, source: str, file_path: str, language: str) -> CodeEntities | None:
        extractor_cls = self._SUPPORTED.get(language.lower())
        if extractor_cls is None:
            return None
        return extractor_cls().extract(source, file_path)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _combine_paths(prefix: str, suffix: str) -> str:
    prefix = prefix.rstrip("/")
    if not suffix:
        return prefix or "/"
    if not suffix.startswith("/"):
        suffix = "/" + suffix
    return prefix + suffix


__all__ = [
    "ClassInfo",
    "MethodInfo",
    "FieldInfo",
    "ImportInfo",
    "RestEndpointInfo",
    "CodeEntities",
    "JavaAstExtractor",
    "CodeGraphExtractor",
]
