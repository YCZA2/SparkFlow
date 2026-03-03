"""
SparkFlow Backend - FastAPI Application
"""
from fastapi import FastAPI

app = FastAPI(
    title="SparkFlow API",
    description="灵感编导 AI - 后端 API 服务",
    version="0.1.0"
)


@app.get("/")
async def root():
    """Health check endpoint"""
    return {"status": "ok"}
