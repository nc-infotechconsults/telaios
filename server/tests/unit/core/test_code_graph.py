"""Unit tests for JavaAstExtractor and CodeGraphExtractor.

tree-sitter-java must be installed (uv sync --extra treesitter).
Tests skipped if not available.
"""

from __future__ import annotations

import pytest

# Guard: skip entire module if tree-sitter-java not installed
pytest.importorskip("tree_sitter_java", reason="tree-sitter-java not installed — run: uv sync --extra treesitter")

from telaios.core.knowledge.code_graph import (
    ClassInfo,
    CodeEntities,
    CodeGraphExtractor,
    JavaAstExtractor,
    RestEndpointInfo,
)

# ── Fixtures ──────────────────────────────────────────────────────────────────

_SIMPLE_CLASS = """\
package com.example;

public class UserService {
    private UserRepository userRepository;

    public User getUserById(Long id) {
        return userRepository.findById(id).orElse(null);
    }
}
"""

_CONTROLLER = """\
package com.example.controller;

import com.example.service.UserService;
import com.example.dto.UserCreateDTO;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserService userService;

    @GetMapping("/{id}")
    public User getUser(@PathVariable Long id) {
        return userService.getUserById(id);
    }

    @PostMapping
    public User createUser(@RequestBody UserCreateDTO dto) {
        return userService.createUser(dto);
    }
}
"""

_INTERFACE = """\
package com.example.service;

public interface UserService {
    User getUserById(Long id);
    User createUser(UserCreateDTO dto);
}
"""

_INHERITANCE = """\
package com.example;

public class AdminService extends UserService implements Auditable, Serializable {
    public void doAdmin() {}
}
"""

_ENUM = """\
package com.example.domain;

public enum Status { ACTIVE, INACTIVE, PENDING }
"""

_SPRING_SERVICE = """\
package com.example;

@Service
public class OrderService {
    @Autowired
    private OrderRepository orderRepository;
}
"""


# ── JavaAstExtractor ──────────────────────────────────────────────────────────


class TestJavaAstExtractorClass:
    @pytest.fixture
    def extractor(self):
        return JavaAstExtractor()

    def test_extracts_class_name(self, extractor):
        entities = extractor.extract(_SIMPLE_CLASS, "UserService.java")
        names = [c.name for c in entities.classes]
        assert "UserService" in names

    def test_extracts_package(self, extractor):
        entities = extractor.extract(_SIMPLE_CLASS, "UserService.java")
        assert entities.classes[0].package == "com.example"

    def test_qualified_name(self, extractor):
        entities = extractor.extract(_SIMPLE_CLASS, "UserService.java")
        cls = entities.classes[0]
        assert cls.qualified_name == "com.example.UserService"

    def test_extracts_methods(self, extractor):
        entities = extractor.extract(_SIMPLE_CLASS, "UserService.java")
        method_names = [m.name for m in entities.methods]
        assert "getUserById" in method_names

    def test_extracts_fields(self, extractor):
        entities = extractor.extract(_SIMPLE_CLASS, "UserService.java")
        field_names = [f.name for f in entities.fields]
        assert "userRepository" in field_names

    def test_field_class_reference(self, extractor):
        entities = extractor.extract(_SIMPLE_CLASS, "UserService.java")
        field = next(f for f in entities.fields if f.name == "userRepository")
        assert field.class_name == "UserService"
        assert field.field_type == "UserRepository"


class TestJavaAstExtractorInterface:
    @pytest.fixture
    def extractor(self):
        return JavaAstExtractor()

    def test_interface_is_flagged(self, extractor):
        entities = extractor.extract(_INTERFACE, "UserService.java")
        cls = next(c for c in entities.classes if c.name == "UserService")
        assert cls.is_interface

    def test_interface_not_enum(self, extractor):
        entities = extractor.extract(_INTERFACE, "UserService.java")
        cls = next(c for c in entities.classes if c.name == "UserService")
        assert not cls.is_enum


class TestJavaAstExtractorEnum:
    @pytest.fixture
    def extractor(self):
        return JavaAstExtractor()

    def test_enum_detected(self, extractor):
        entities = extractor.extract(_ENUM, "Status.java")
        cls = next(c for c in entities.classes if c.name == "Status")
        assert cls.is_enum


class TestJavaAstExtractorInheritance:
    @pytest.fixture
    def extractor(self):
        return JavaAstExtractor()

    def test_superclass_extracted(self, extractor):
        entities = extractor.extract(_INHERITANCE, "AdminService.java")
        cls = next(c for c in entities.classes if c.name == "AdminService")
        assert cls.superclass == "UserService"

    def test_interfaces_extracted(self, extractor):
        entities = extractor.extract(_INHERITANCE, "AdminService.java")
        cls = next(c for c in entities.classes if c.name == "AdminService")
        assert "Auditable" in cls.interfaces
        assert "Serializable" in cls.interfaces


class TestJavaAstExtractorAnnotations:
    @pytest.fixture
    def extractor(self):
        return JavaAstExtractor()

    def test_rest_controller_annotation(self, extractor):
        entities = extractor.extract(_CONTROLLER, "UserController.java")
        cls = next(c for c in entities.classes if c.name == "UserController")
        assert "RestController" in cls.annotations
        assert cls.component_type == "controller"

    def test_service_annotation(self, extractor):
        entities = extractor.extract(_SPRING_SERVICE, "OrderService.java")
        cls = next(c for c in entities.classes if c.name == "OrderService")
        assert "Service" in cls.annotations
        assert cls.component_type == "service"

    def test_autowired_field_detected(self, extractor):
        entities = extractor.extract(_SPRING_SERVICE, "OrderService.java")
        field = next((f for f in entities.fields if f.name == "orderRepository"), None)
        assert field is not None
        assert field.is_autowired


class TestJavaAstExtractorRestEndpoints:
    @pytest.fixture
    def extractor(self):
        return JavaAstExtractor()

    def test_get_endpoint_extracted(self, extractor):
        entities = extractor.extract(_CONTROLLER, "UserController.java")
        get_eps = [e for e in entities.endpoints if e.http_method == "GET"]
        assert len(get_eps) >= 1

    def test_post_endpoint_extracted(self, extractor):
        entities = extractor.extract(_CONTROLLER, "UserController.java")
        post_eps = [e for e in entities.endpoints if e.http_method == "POST"]
        assert len(post_eps) >= 1

    def test_endpoint_path_includes_class_prefix(self, extractor):
        entities = extractor.extract(_CONTROLLER, "UserController.java")
        paths = [e.path for e in entities.endpoints]
        # GET /{id} gets prefixed with class @RequestMapping("/api/users")
        assert any("/api/users" in p for p in paths)

    def test_post_request_body_type(self, extractor):
        entities = extractor.extract(_CONTROLLER, "UserController.java")
        post_ep = next(e for e in entities.endpoints if e.http_method == "POST")
        assert post_ep.request_body_type == "UserCreateDTO"

    def test_handler_class_and_method(self, extractor):
        entities = extractor.extract(_CONTROLLER, "UserController.java")
        ep = next(e for e in entities.endpoints if e.http_method == "GET")
        assert ep.handler_class == "UserController"
        assert ep.handler_method == "getUser"


class TestJavaAstExtractorImports:
    @pytest.fixture
    def extractor(self):
        return JavaAstExtractor()

    def test_imports_extracted(self, extractor):
        entities = extractor.extract(_CONTROLLER, "UserController.java")
        fqns = [i.imported_fqn for i in entities.imports]
        assert any("UserService" in fqn for fqn in fqns)
        assert any("UserCreateDTO" in fqn for fqn in fqns)


class TestJavaAstExtractorEdgeCases:
    @pytest.fixture
    def extractor(self):
        return JavaAstExtractor()

    def test_empty_source_returns_empty_entities(self, extractor):
        entities = extractor.extract("", "Empty.java")
        assert entities.is_empty()

    def test_invalid_java_returns_empty_entities(self, extractor):
        entities = extractor.extract("this is not java code @@@###", "Bad.java")
        # Must not raise; may return empty or partial
        assert isinstance(entities, CodeEntities)

    def test_file_path_stored(self, extractor):
        entities = extractor.extract(_SIMPLE_CLASS, "UserService.java")
        assert entities.file_path == "UserService.java"


# ── CodeGraphExtractor dispatcher ─────────────────────────────────────────────


class TestCodeGraphExtractor:
    @pytest.fixture
    def extractor(self):
        return CodeGraphExtractor()

    def test_java_file_dispatches_to_java_extractor(self, extractor):
        entities = extractor.extract(_SIMPLE_CLASS, "UserService.java", language="java")
        assert entities is not None
        assert len(entities.classes) >= 1

    def test_unsupported_language_returns_none(self, extractor):
        result = extractor.extract("fn main() {}", "main.rs", language="rust")
        assert result is None

    def test_supports_java(self, extractor):
        assert CodeGraphExtractor.supports("java")

    def test_does_not_support_rust(self, extractor):
        assert not CodeGraphExtractor.supports("rust")
