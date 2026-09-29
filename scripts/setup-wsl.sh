#!/usr/bin/env bash
set -euo pipefail
base=/opt/research-knowledge
install -d -m 755 "$base"
curl --fail --location --retry 3 https://github.com/FalkorDB/FalkorDB/releases/download/v4.20.7/falkordb-x64.so -o "$base/falkordb.so.download"
python3 - "$base/falkordb.so.download" <<'PY'
import urllib.request,json,hashlib,sys
data=json.load(urllib.request.urlopen('https://api.github.com/repos/FalkorDB/FalkorDB/releases/tags/v4.20.7'))
asset=next(x for x in data['assets'] if x['name']=='falkordb-x64.so')
digest=hashlib.sha256(open(sys.argv[1],'rb').read()).hexdigest()
assert asset.get('digest')=='sha256:'+digest, 'Release checksum verification failed'
open('/opt/research-knowledge/falkordb-release.json','w').write(json.dumps({'tag':data['tag_name'],'asset':asset['name'],'sha256':digest,'url':asset['browser_download_url']},indent=2))
PY
mv "$base/falkordb.so.download" "$base/falkordb.so"
chmod 755 "$base/falkordb.so"
install -d -o redis -g redis -m 750 /var/lib/research-knowledge
if [ ! -f "$base/server.secret" ]; then python3 -c 'import secrets;print(secrets.token_hex(32))' > "$base/server.secret"; fi
chmod 600 "$base/server.secret"
{
  printf 'bind 127.0.0.1\nport 6387\nprotected-mode yes\ndaemonize no\n'
  printf 'loadmodule /opt/research-knowledge/falkordb.so THREAD_COUNT 4\n'
  printf 'dir /var/lib/research-knowledge\ndbfilename knowledge.rdb\nappendonly yes\nappendfsync everysec\nmaxmemory-policy noeviction\n'
  printf 'requirepass %s\n' "$(cat "$base/server.secret")"
} > "$base/redis.conf"
chown root:redis "$base/redis.conf"
chmod 640 "$base/redis.conf"
cat > /etc/systemd/system/research-knowledge.service <<'UNIT'
[Unit]
Description=Research Knowledge FalkorDB
After=network.target
[Service]
Type=simple
User=redis
Group=redis
ExecStart=/usr/bin/redis-server /opt/research-knowledge/redis.conf
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/lib/research-knowledge
PrivateTmp=true
[Install]
WantedBy=multi-user.target
UNIT
if [ "$(cat /proc/1/comm)" = systemd ]; then
  systemctl daemon-reload
  systemctl enable --now research-knowledge.service
  systemctl is-active research-knowledge.service
else
  runuser -u redis -- redis-server "$base/redis.conf" --daemonize yes --pidfile /var/lib/research-knowledge/server.pid --logfile /var/lib/research-knowledge/server.log
fi
sha256sum "$base/falkordb.so"
