"""Smoke test: MessageRead includes the new fields."""
from telaios.modules.messages.schemas import MessageRead
import uuid
from datetime import datetime


def test_message_read_includes_sender_type():
    msg = MessageRead(
        id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        plan_id=None,
        user_id=None,
        role="user",
        sender_type="user",
        specialist=None,
        content="hello",
        created_at=datetime.now(),
    )
    assert msg.sender_type == "user"
    assert msg.specialist is None
