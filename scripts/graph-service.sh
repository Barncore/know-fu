#!/usr/bin/env bash
set -euo pipefail
base=/opt/research-knowledge
test -r "$base/redis.conf" || { echo 'SETUP_REQUIRED: FalkorDB configuration missing' >&2; exit 2; }
action="$1"
ping() { REDISCLI_AUTH="$(cat "$base/server.secret")" redis-cli -h 127.0.0.1 -p 6387 ping </dev/null 2>/dev/null; }
stop() { REDISCLI_AUTH="$(cat "$base/server.secret")" redis-cli -h 127.0.0.1 -p 6387 shutdown save </dev/null; }
if [ "$action" = restart ] || [ "$action" = stop ]; then if ping | grep -q PONG; then stop; fi; fi
if [ "$action" = restart ] || [ "$action" = start ]; then
  if ! ping | grep -q PONG; then
    if [ "$(cat /proc/1/comm)" = systemd ]; then systemctl start research-knowledge.service
    else runuser -u redis -- redis-server "$base/redis.conf" --daemonize yes --pidfile /var/lib/research-knowledge/server.pid --logfile /var/lib/research-knowledge/server.log </dev/null; fi
  fi
fi
if [ "$action" = stop ]; then echo STOPPED; exit; fi
for attempt in {1..50}; do if ping | grep -q PONG; then echo PONG; exit; fi; sleep .1; done
echo 'FalkorDB did not become ready' >&2
exit 1
