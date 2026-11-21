"""
ClipForge API — WebSocket connection manager.

Maintains per-project connection pools and broadcasts real-time
progress updates to all connected clients of a given project.
"""

from typing import Any

from fastapi import WebSocket


class ConnectionManager:
    """
    Manages active WebSocket connections grouped by ``project_id``.

    Usage in a route::

        manager = ConnectionManager()

        @app.websocket("/ws/{project_id}")
        async def ws_endpoint(websocket: WebSocket, project_id: str):
            await manager.connect(websocket, project_id)
            try:
                while True:
                    await websocket.receive_text()
            except WebSocketDisconnect:
                manager.disconnect(websocket, project_id)
    """

    def __init__(self) -> None:
        # Mapping of project_id → set of active websocket connections.
        self._connections: dict[str, set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, project_id: str) -> None:
        """Accept the websocket and register it under *project_id*."""
        await websocket.accept()
        if project_id not in self._connections:
            self._connections[project_id] = set()
        self._connections[project_id].add(websocket)

    def disconnect(self, websocket: WebSocket, project_id: str) -> None:
        """Remove the websocket from the *project_id* pool."""
        pool = self._connections.get(project_id)
        if pool is not None:
            pool.discard(websocket)
            if not pool:
                del self._connections[project_id]

    async def broadcast(self, project_id: str, message: dict[str, Any]) -> None:
        """
        Send *message* as JSON to every client watching *project_id*.

        Silently drops connections that have already closed.
        """
        pool = self._connections.get(project_id)
        if pool is None:
            return

        stale: list[WebSocket] = []
        for ws in pool:
            try:
                await ws.send_json(message)
            except Exception:
                stale.append(ws)

        # Clean up dead connections discovered during the broadcast.
        for ws in stale:
            pool.discard(ws)
        if not pool:
            del self._connections[project_id]


# Module-level singleton so the manager can be imported anywhere.
ws_manager = ConnectionManager()
