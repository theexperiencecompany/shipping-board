# Deploying the board

Runs as a single Node process that serves the built assets and `/api/board`.
The API needs a GitHub token at runtime, so this cannot be a static host.

On the home box:

```sh
sudo mkdir -p /srv/shipping-board
sudo chown aryan:aryan /srv/shipping-board
git clone https://github.com/theexperiencecompany/shipping-board /srv/shipping-board
cd /srv/shipping-board
gh auth token > .gh-token && chmod 600 .gh-token
npx vp install
npx vp build

sudo cp deploy/shipping-board.service /etc/systemd/system/
sudo systemctl enable --now shipping-board
```

Reverse proxy:

```sh
sudo cp deploy/Caddyfile /etc/caddy/sites/lab.heygaia.io.caddy
sudo systemctl reload caddy
```

DNS: `lab.heygaia.io` is an A record to the tailnet address the box already uses
(`docs.lab.heygaia.io` points at the same host). Add it in Cloudflare next to the
`docs` record.

Check:

```sh
curl -s localhost:5181/api/board | head -c 200
```

## Preview a branch

`shipping-next.lab.heygaia.io` serves a branch next to the live board. It runs as
the `shipping-board-next` container on the `homepage_default` network, with the
same env file, behind a `@shippingnext` handle in `~/lab-caddy/Caddyfile`.

Update it to the branch's latest commit:

```sh
ssh gaia@gaia-home-server '
  cd ~/shipping-board-next && git pull -q &&
  docker build -q -t shipping-board-next:local . &&
  docker rm -f shipping-board-next &&
  docker run -d --name shipping-board-next --restart always \
    --env-file ~/shipping-board.env --network homepage_default \
    -p 127.0.0.1:5182:5181 \
    shipping-board-next:local npx vp preview --port 5181 --strictPort'
```

The M4 runner (`tag:runner`) cannot reach `*.lab` on 443. It reads the board at
`http://gaia-home-server.taila76294.ts.net:5182`, served by
`tailscale serve --bg --tcp 5182 tcp://127.0.0.1:5182` (bypasses ufw, like 443) and
allowed by one tailnet rule: `tag:runner` → `tag:homelab:5182`.

Remove it: `docker rm -f shipping-board-next`, `sudo tailscale serve --tcp 5182 off`, delete the `@shippingnext` handle,
then `docker exec lab-caddy caddy reload --config /etc/caddy/Caddyfile`.
