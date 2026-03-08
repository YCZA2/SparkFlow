import unittest
from unittest.mock import AsyncMock

import httpx

from core.exceptions import ServiceUnavailableError, ValidationError
from modules.agent.dify_client import DifyClient


class DifyClientTestCase(unittest.TestCase):
    def test_submit_workflow_run_success(self) -> None:
        client = DifyClient(
            base_url="https://dify.example.com/v1",
            api_key="test-key",
            http_client=AsyncMock(
                request=AsyncMock(
                    return_value=httpx.Response(
                        200,
                        json={"data": {"id": "run-1", "workflow_id": "wf-1", "status": "running", "outputs": {}}},
                    )
                )
            ),
        )

        result = __import__("asyncio").run(client.submit_workflow_run(inputs={"topic": "定位"}, user="u1"))
        self.assertEqual(result.run_id, "run-1")
        self.assertEqual(result.workflow_id, "wf-1")
        self.assertEqual(result.status, "running")

    def test_get_workflow_run_raises_validation_for_4xx(self) -> None:
        client = DifyClient(
            base_url="https://dify.example.com/v1",
            api_key="test-key",
            http_client=AsyncMock(
                request=AsyncMock(
                    return_value=httpx.Response(400, json={"message": "bad request"})
                )
            ),
        )

        with self.assertRaises(ValidationError):
            __import__("asyncio").run(client.get_workflow_run(run_id="run-1"))

    def test_get_workflow_run_raises_service_unavailable_for_5xx(self) -> None:
        client = DifyClient(
            base_url="https://dify.example.com/v1",
            api_key="test-key",
            http_client=AsyncMock(
                request=AsyncMock(
                    return_value=httpx.Response(503, json={"message": "unavailable"})
                )
            ),
        )

        with self.assertRaises(ServiceUnavailableError):
            __import__("asyncio").run(client.get_workflow_run(run_id="run-1"))

