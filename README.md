# NEO-BOT · Robot animado controlado con Prolog

Página web con un robot de diseño simple y colores **neón** cuyas instrucciones están escritas en **Prolog**.
El robot reconoce cada instrucción mediante **hechos y reglas** y ejecuta el movimiento correspondiente.

## ¿Cómo funciona?

- [`prolog/robot.pl`](prolog/robot.pl) es el cerebro del robot:
  - **Hechos**: vocabulario (`instruccion(adelante, mover(0,1)).`), colores, costos de energía, rutinas, límites del tablero.
  - **Reglas**: `reconocer/2` traduce lo que escribe el usuario, `bloqueada/2` valida (motor apagado, batería, choques) y `ejecutar/2` devuelve la lista de eventos a animar.
  - **Estado dinámico**: `posicion/2`, `bateria/1`, `motor/1`, `color/1` (con `assertz`/`retract`).
- [`js/app.js`](js/app.js) solo consulta a Prolog (con [Tau Prolog](https://tau-prolog.org), que corre en el navegador) y anima los eventos que Prolog devuelve.

## Instrucciones reconocidas

| Tipo | Instrucciones |
| --- | --- |
| Movimiento | `adelante`, `atras`, `izquierda`, `derecha` (+ sinónimos `avanzar`, `retroceder`) |
| Acciones | `saltar`, `saludar`, `bailar`, `girar` |
| Sistema | `encender`, `apagar`, `cargar` |
| Color | `color(cian)`, `color(magenta)`, `color(lima)`, `color(amarillo)`, `color(naranja)`, `color(violeta)` |
| Compuestas | `repetir(N, Instruccion)`, `rutina(cuadrado)`, `rutina(zigzag)`, `rutina(saludo)`, `rutina(patrulla)`, `rutina(fiesta)` |

Además hay una **consola Prolog** para hacer consultas libres, por ejemplo `estado(X,Y,B,M,C).`

## Ejecutar en local

Es un sitio estático; basta con servirlo por HTTP (necesita `fetch` para cargar `robot.pl`):

```bash
npx serve .
```

## Créditos

Intérprete de Prolog: [Tau Prolog](https://github.com/tau-prolog/tau-prolog) (BSD-3-Clause), incluido en `js/vendor/`.
