#!/bin/bash
cd /home/kavia/workspace/code-generation/sketchquest-106974-940fc2df/react_frontend
npm run build
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
   exit 1
fi

