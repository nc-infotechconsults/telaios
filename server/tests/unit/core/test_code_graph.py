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

# Controller that extends a generic CRUD base class — typical inheritance scenario.
# The base class (BaseCrudController) is defined elsewhere; only the child is here.
_CHILD_CONTROLLER = """\
package com.example.controller;

@RestController
@RequestMapping("/api/products")
public class ProductController extends BaseCrudController<ProductDto, Long> {

    @GetMapping("/search")
    public List<ProductDto> search(@RequestParam String q) {
        return service.search(q);
    }
}
"""

# Simulated base class that the child inherits from.
_BASE_CONTROLLER = """\
package com.example.base;

@RestController
public class BaseCrudController<T, ID> {

    @GetMapping
    public List<T> getAll() { return service.findAll(); }

    @GetMapping("/{id}")
    public T getById(@PathVariable ID id) { return service.findById(id); }

    @PostMapping
    public T create(@RequestBody T body) { return service.save(body); }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable ID id) { service.delete(id); }
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

    def test_request_mapping_prefix_stored_on_class(self, extractor):
        entities = extractor.extract(_CONTROLLER, "UserController.java")
        cls = next(c for c in entities.classes if c.name == "UserController")
        assert cls.request_mapping_prefix == "/api/users"

    def test_method_path_suffix_stored_on_endpoint(self, extractor):
        entities = extractor.extract(_CONTROLLER, "UserController.java")
        get_ep = next(e for e in entities.endpoints if e.http_method == "GET")
        # method_path is the suffix before combining with class prefix
        assert get_ep.method_path == "/{id}"

    def test_post_method_path_is_root_when_no_suffix(self, extractor):
        entities = extractor.extract(_CONTROLLER, "UserController.java")
        post_ep = next(e for e in entities.endpoints if e.http_method == "POST")
        assert post_ep.method_path == "/"

    def test_class_with_no_request_mapping_has_empty_prefix(self, extractor):
        entities = extractor.extract(_BASE_CONTROLLER, "BaseCrudController.java")
        cls = next(c for c in entities.classes if c.name == "BaseCrudController")
        assert cls.request_mapping_prefix == ""

    def test_base_controller_endpoints_have_method_paths(self, extractor):
        entities = extractor.extract(_BASE_CONTROLLER, "BaseCrudController.java")
        get_eps = [e for e in entities.endpoints if e.http_method == "GET"]
        method_paths = {e.method_path for e in get_eps}
        assert "/" in method_paths      # @GetMapping (no path)
        assert "/{id}" in method_paths  # @GetMapping("/{id}")

    def test_child_controller_extracts_own_endpoint(self, extractor):
        entities = extractor.extract(_CHILD_CONTROLLER, "ProductController.java")
        paths = [e.path for e in entities.endpoints]
        assert "/api/products/search" in paths

    def test_child_controller_stores_superclass(self, extractor):
        entities = extractor.extract(_CHILD_CONTROLLER, "ProductController.java")
        cls = next(c for c in entities.classes if c.name == "ProductController")
        assert cls.superclass == "BaseCrudController"


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


# ── PythonAstExtractor ────────────────────────────────────────────────────────

_PY_SIMPLE_CLASS = """\
class UserService:
    def __init__(self, repo):
        self.repo = repo

    def get_user(self, user_id: int) -> "User":
        return self.repo.find(user_id)

    def _internal(self):
        pass
"""

_PY_FLASK_ROUTES = """\
from flask import Flask
app = Flask(__name__)

@app.route('/users', methods=['GET'])
def list_users():
    return []

@app.post('/users')
def create_user():
    return {}
"""

_PY_FASTAPI_ROUTES = """\
from fastapi import APIRouter
router = APIRouter()

@router.get('/items/{item_id}')
async def get_item(item_id: int):
    return {}

@router.delete('/items/{item_id}')
async def delete_item(item_id: int):
    pass
"""

_PY_INHERITANCE = """\
class AdminService(UserService, AuditMixin):
    def promote(self, user_id: int) -> None:
        pass
"""

_PY_IMPORTS = """\
import os
from pathlib import Path
from myapp.services import UserService

class Controller:
    pass
"""


class TestPythonAstExtractorClass:
    @pytest.fixture
    def extractor(self):
        from telaios.core.knowledge.code_graph import PythonAstExtractor
        return PythonAstExtractor()

    def test_extracts_class_name(self, extractor):
        entities = extractor.extract(_PY_SIMPLE_CLASS, "user_service.py")
        names = [c.name for c in entities.classes]
        assert "UserService" in names

    def test_extracts_public_method(self, extractor):
        entities = extractor.extract(_PY_SIMPLE_CLASS, "user_service.py")
        names = [m.name for m in entities.methods]
        assert "get_user" in names

    def test_private_method_visibility(self, extractor):
        entities = extractor.extract(_PY_SIMPLE_CLASS, "user_service.py")
        m = next(m for m in entities.methods if m.name == "_internal")
        assert m.visibility == "private"

    def test_public_method_visibility(self, extractor):
        entities = extractor.extract(_PY_SIMPLE_CLASS, "user_service.py")
        m = next(m for m in entities.methods if m.name == "get_user")
        assert m.visibility == "public"

    def test_superclass_extracted(self, extractor):
        entities = extractor.extract(_PY_INHERITANCE, "admin.py")
        cls = next(c for c in entities.classes if c.name == "AdminService")
        assert cls.superclass == "UserService"

    def test_second_base_in_interfaces(self, extractor):
        entities = extractor.extract(_PY_INHERITANCE, "admin.py")
        cls = next(c for c in entities.classes if c.name == "AdminService")
        assert "AuditMixin" in cls.interfaces

    def test_empty_source_returns_empty(self, extractor):
        entities = extractor.extract("", "empty.py")
        assert entities.is_empty()

    def test_file_path_stored(self, extractor):
        entities = extractor.extract(_PY_SIMPLE_CLASS, "user_service.py")
        assert entities.file_path == "user_service.py"


class TestPythonAstExtractorEndpoints:
    @pytest.fixture
    def extractor(self):
        from telaios.core.knowledge.code_graph import PythonAstExtractor
        return PythonAstExtractor()

    def test_flask_get_endpoint(self, extractor):
        entities = extractor.extract(_PY_FLASK_ROUTES, "routes.py")
        get_eps = [e for e in entities.endpoints if e.http_method == "GET"]
        assert len(get_eps) >= 1

    def test_flask_get_path(self, extractor):
        entities = extractor.extract(_PY_FLASK_ROUTES, "routes.py")
        paths = [e.path for e in entities.endpoints]
        assert "/users" in paths

    def test_flask_post_shorthand(self, extractor):
        entities = extractor.extract(_PY_FLASK_ROUTES, "routes.py")
        post_eps = [e for e in entities.endpoints if e.http_method == "POST"]
        assert len(post_eps) >= 1

    def test_fastapi_get_endpoint(self, extractor):
        entities = extractor.extract(_PY_FASTAPI_ROUTES, "routes.py")
        get_eps = [e for e in entities.endpoints if e.http_method == "GET"]
        assert len(get_eps) >= 1

    def test_fastapi_delete_endpoint(self, extractor):
        entities = extractor.extract(_PY_FASTAPI_ROUTES, "routes.py")
        del_eps = [e for e in entities.endpoints if e.http_method == "DELETE"]
        assert len(del_eps) >= 1

    def test_fastapi_path_extracted(self, extractor):
        entities = extractor.extract(_PY_FASTAPI_ROUTES, "routes.py")
        paths = [e.path for e in entities.endpoints]
        assert any("/items" in p for p in paths)


class TestPythonAstExtractorImports:
    @pytest.fixture
    def extractor(self):
        from telaios.core.knowledge.code_graph import PythonAstExtractor
        return PythonAstExtractor()

    def test_imports_extracted(self, extractor):
        entities = extractor.extract(_PY_IMPORTS, "ctrl.py")
        fqns = [i.imported_fqn for i in entities.imports]
        assert any("UserService" in f for f in fqns)
