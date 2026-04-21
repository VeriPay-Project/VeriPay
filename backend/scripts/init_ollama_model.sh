#!/bin/sh
set -eu

export OLLAMA_HOST="${OLLAMA_HOST:-http://ollama:11434}"
MODEL="${OLLAMA_MODEL:-qwen2.5:0.5b}"
WARMUP_PROMPT="${OLLAMA_WARMUP_PROMPT:-Respond with only {\"ok\":true}.}"

echo "Waiting for Ollama server at ${OLLAMA_HOST}..."
until ollama list > /dev/null 2>&1; do
  sleep 2
done

echo "Ollama server ready."
echo "Ensuring model ${MODEL} is present..."
ollama pull "${MODEL}" > /dev/null

echo "Warming model ${MODEL} into memory..."
ollama run "${MODEL}" "${WARMUP_PROMPT}" > /dev/null 2>&1

echo "Model ${MODEL} is pulled and warmed."
