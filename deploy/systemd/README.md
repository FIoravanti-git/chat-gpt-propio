# Servicio systemd para NeuroChat

Para que el stack (frontend, auth, Quivr, WhatsApp) se ejecute como servicio y arranque con el sistema:

```bash
# Copiar la unidad
sudo cp /opt/proyectos/chat-gpt-propio/deploy/systemd/neurochat.service /etc/systemd/system/

# Recargar systemd
sudo systemctl daemon-reload

# Activar al arranque y arrancar ahora
sudo systemctl enable neurochat
sudo systemctl start neurochat

# Comprobar estado
sudo systemctl status neurochat
```

Comandos útiles:

- `sudo systemctl stop neurochat`   — detener
- `sudo systemctl restart neurochat` — reiniciar
- `journalctl -u neurochat -f`      — ver logs en vivo
