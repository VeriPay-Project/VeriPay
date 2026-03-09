#!/bin/sh
set -e

echo "Waiting for Ollama server..."

until ollama list > /dev/null 2>&1; do
sleep 2
done

echo "Ollama server ready."

echo "Pulling qwen2.5:3b model..."
ollama pull qwen2.5:3b

echo "Model successfully pulled."
