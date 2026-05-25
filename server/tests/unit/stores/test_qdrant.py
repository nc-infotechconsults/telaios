import pytest
from unittest.mock import AsyncMock, MagicMock
from telaios.core.stores.qdrant import QdrantVectorStore


@pytest.fixture
def mock_client():
    client = AsyncMock()
    col = MagicMock()
    col.name = "repositories"
    client.get_collections.return_value = MagicMock(collections=[col])
    return client


@pytest.fixture
def store(mock_client):
    embedder = MagicMock()
    return QdrantVectorStore(client=mock_client, embedder=embedder)


@pytest.mark.asyncio
async def test_fetch_by_source_path_returns_chunks(store, mock_client):
    r1 = MagicMock()
    r1.id = "aaa"
    r1.payload = {
        "content": "class A {}",
        "project_id": "p1",
        "source_path": "src/A.java",
        "start_line": 1,
    }
    r2 = MagicMock()
    r2.id = "bbb"
    r2.payload = {
        "content": "  void method() {}",
        "project_id": "p1",
        "source_path": "src/A.java",
        "start_line": 3,
    }
    mock_client.scroll.return_value = ([r1, r2], None)

    chunks = await store.fetch_by_source_path("repositories", "p1", "src/A.java")

    assert len(chunks) == 2
    assert chunks[0].id == "aaa"
    assert chunks[1].id == "bbb"
    assert chunks[0].content == "class A {}"
    mock_client.scroll.assert_called_once()


@pytest.mark.asyncio
async def test_fetch_by_source_path_missing_collection_returns_empty(store, mock_client):
    mock_client.get_collections.return_value = MagicMock(collections=[])

    chunks = await store.fetch_by_source_path("repositories", "p1", "src/A.java")

    assert chunks == []
    mock_client.scroll.assert_not_called()


@pytest.mark.asyncio
async def test_fetch_by_source_path_passes_correct_filter(store, mock_client):
    from qdrant_client.models import Filter
    mock_client.scroll.return_value = ([], None)

    await store.fetch_by_source_path("repositories", "proj-42", "com/example/Foo.java")

    call_kwargs = mock_client.scroll.call_args.kwargs
    scroll_filter: Filter = call_kwargs["scroll_filter"]
    keys = {cond.key for cond in scroll_filter.must}
    assert "project_id" in keys
    assert "source_path" in keys
