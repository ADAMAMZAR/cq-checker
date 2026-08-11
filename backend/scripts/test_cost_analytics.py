"""Test script to reproduce error in get_cost_analytics."""

import sys
import os
import asyncio
import traceback

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

async def main():
    try:
        from app.services.audit_data_access import get_cost_analytics
        res = await get_cost_analytics()
        print("Success! Keys in response:", list(res.keys()))
    except Exception as e:
        print("Error calling get_cost_analytics():", e)
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
