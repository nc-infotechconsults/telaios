"""Tests for ConversationAgent specialist detection."""
import pytest
from telaios.modules.projects.conversation.agent import ConversationAgent


@pytest.mark.parametrize("text,expected", [
    ("design a login screen wireframe", "designer"),
    ("plan the migration to microservices", "planner"),
    ("review this PR for security issues", "reviewer"),
    ("implement the authentication module", "coder"),
    ("where is the User class defined", "explorer"),
    ("trace the payment flow sequence", "reverse"),
    ("what does the config module do", "qa"),
])
def test_detect_specialist(text, expected):
    assert ConversationAgent.detect_specialist(text) == expected
