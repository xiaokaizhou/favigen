#!/usr/bin/env bash
cd ~/projects/favigen
for i in $(seq 1 20); do
  out=$(git push -u origin main 2>&1)
  if echo "$out" | grep -qE "up to date|Everything up-to-date|-> main|set up to track"; then
    echo "PUSH_OK $(date)" >> /tmp/favigen_push.log
    echo "$out" >> /tmp/favigen_push.log
    break
  fi
  echo "retry $i failed: $(echo "$out" | tail -1)" >> /tmp/favigen_push.log
  sleep 20
done
