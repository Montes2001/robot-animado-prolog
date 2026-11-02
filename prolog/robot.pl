% ============================================================
%  NEO-BOT  ::  Cerebro del robot escrito en Prolog
%  El robot reconoce cada instruccion mediante HECHOS y REGLAS
%  y devuelve la lista de EVENTOS que la pagina debe animar.
% ============================================================

:- dynamic(posicion/2).
:- dynamic(bateria/1).
:- dynamic(motor/1).
:- dynamic(color/1).

% ------------------------------------------------------------
%  1. ESTADO INICIAL  (hechos dinamicos)
% ------------------------------------------------------------
posicion(4, 2).
bateria(100).
motor(apagado).
color(cian).

% ------------------------------------------------------------
%  2. HECHOS: el mundo del robot
% ------------------------------------------------------------
tablero(8, 4).                 % columnas 0..8  y  filas 0..4

color_neon(cian).
color_neon(magenta).
color_neon(lima).
color_neon(amarillo).
color_neon(naranja).
color_neon(violeta).

% ------------------------------------------------------------
%  3. HECHOS: vocabulario de instrucciones
%     instruccion(Palabra, Accion)
% ------------------------------------------------------------
instruccion(adelante,   mover(0, 1)).
instruccion(avanzar,    mover(0, 1)).
instruccion(atras,      mover(0, -1)).
instruccion(retroceder, mover(0, -1)).
instruccion(izquierda,  mover(-1, 0)).
instruccion(derecha,    mover(1, 0)).
instruccion(saltar,     gesto(saltar)).
instruccion(saludar,    gesto(saludar)).
instruccion(bailar,     gesto(bailar)).
instruccion(girar,      gesto(girar)).
instruccion(encender,   motor(encendido)).
instruccion(apagar,     motor(apagado)).
instruccion(cargar,     cargar).

% ------------------------------------------------------------
%  4. HECHOS: costo de energia y requisitos de cada accion
% ------------------------------------------------------------
costo(mover(_, _),  5).
costo(gesto(saltar),  8).
costo(gesto(saludar), 2).
costo(gesto(bailar), 12).
costo(gesto(girar),   6).

requiere_motor(mover(_, _)).
requiere_motor(gesto(_)).
requiere_motor(pintar(_)).

% ------------------------------------------------------------
%  5. HECHOS: rutinas (programas guardados)
% ------------------------------------------------------------
rutina(cuadrado, [derecha, derecha, adelante, adelante,
                  izquierda, izquierda, atras, atras]).
rutina(zigzag,   [derecha, adelante, derecha, atras,
                  derecha, adelante, derecha, atras]).
rutina(saludo,   [saludar, girar, saludar]).
rutina(patrulla, [repetir(3, derecha), repetir(2, adelante),
                  repetir(3, izquierda), repetir(2, atras)]).
rutina(fiesta,   [color(magenta), bailar, color(lima),
                  saltar, color(cian), girar]).

% ------------------------------------------------------------
%  6. REGLAS: reconocer(+Instruccion, -Accion)
%     Traduce lo que escribe el usuario en una accion interna.
% ------------------------------------------------------------
reconocer(Cmd, Accion) :-
    atom(Cmd),
    instruccion(Cmd, Accion).
reconocer(color(C), pintar(C)) :-
    color_neon(C).
reconocer(repetir(N, Cmd), repetir(N, Cmd)) :-
    integer(N), N > 0, N =< 12,
    reconocer(Cmd, _).
reconocer(rutina(Nombre), rutina(Nombre)) :-
    rutina(Nombre, _).

% ------------------------------------------------------------
%  7. REGLAS: dentro del tablero / acciones bloqueadas
% ------------------------------------------------------------
dentro(X, Y) :-
    tablero(MaxX, MaxY),
    X >= 0, X =< MaxX,
    Y >= 0, Y =< MaxY.

% bloqueada(+Accion, -Razon): la accion NO se puede ejecutar
bloqueada(motor(encendido), ya_encendido) :- motor(encendido).
bloqueada(motor(apagado),   ya_apagado)   :- motor(apagado).
bloqueada(cargar,           bateria_llena) :- bateria(100).
bloqueada(Accion, motor_apagado) :-
    requiere_motor(Accion),
    motor(apagado).
bloqueada(Accion, sin_bateria) :-
    costo(Accion, Costo),
    bateria(B),
    Costo > B.
bloqueada(mover(DX, DY), choque(DX, DY)) :-
    posicion(X, Y),
    NX is X + DX,
    NY is Y + DY,
    \+ dentro(NX, NY).

% ------------------------------------------------------------
%  8. REGLAS: aplicar(+Accion, -Eventos)
%     Cambia el estado del robot y devuelve lo que hay que animar.
% ------------------------------------------------------------
aplicar(mover(DX, DY), [mover(X, Y, NX, NY)]) :-
    retract(posicion(X, Y)),
    NX is X + DX,
    NY is Y + DY,
    assertz(posicion(NX, NY)).
aplicar(gesto(G), [gesto(G)]).
aplicar(motor(E), [motor(E)]) :-
    retract(motor(_)),
    assertz(motor(E)).
aplicar(pintar(C), [pintar(C)]) :-
    retract(color(_)),
    assertz(color(C)).
aplicar(cargar, [carga]) :-
    retract(bateria(_)),
    assertz(bateria(100)).

cobrar(Accion) :-
    costo(Accion, Costo), !,
    retract(bateria(B)),
    NB is max(0, B - Costo),
    assertz(bateria(NB)).
cobrar(_).

% ------------------------------------------------------------
%  9. REGLA PRINCIPAL: ejecutar(+Instruccion, -Eventos)
% ------------------------------------------------------------
ejecutar(Cmd, Eventos) :-
    nonvar(Cmd),
    reconocer(Cmd, Accion), !,
    realizar(Accion, Eventos).
ejecutar(Cmd, [error(desconocida(Cmd))]).

realizar(repetir(N, Cmd), Eventos) :- !,
    repetir_cmd(N, Cmd, Eventos).
realizar(rutina(Nombre), Eventos) :- !,
    rutina(Nombre, Lista),
    ejecutar_lista(Lista, Eventos).
realizar(Accion, [error(Razon)]) :-
    bloqueada(Accion, Razon), !.
realizar(Accion, Eventos) :-
    aplicar(Accion, Eventos),
    cobrar(Accion).

repetir_cmd(0, _, []) :- !.
repetir_cmd(N, Cmd, Eventos) :-
    ejecutar(Cmd, E1),
    (   con_error(E1)
    ->  Eventos = E1
    ;   N1 is N - 1,
        repetir_cmd(N1, Cmd, E2),
        concatenar(E1, E2, Eventos)
    ).

ejecutar_lista([], []).
ejecutar_lista([Cmd|Resto], Eventos) :-
    ejecutar(Cmd, E1),
    (   con_error(E1)
    ->  Eventos = E1
    ;   ejecutar_lista(Resto, E2),
        concatenar(E1, E2, Eventos)
    ).

% ------------------------------------------------------------
%  10. REGLAS auxiliares
% ------------------------------------------------------------
con_error([error(_)|_]).
con_error([_|Resto]) :- con_error(Resto).

concatenar([], L, L).
concatenar([X|Xs], L, [X|Ys]) :- concatenar(Xs, L, Ys).

% estado(-X, -Y, -Bateria, -Motor, -Color): foto del robot
estado(X, Y, B, M, C) :-
    posicion(X, Y),
    bateria(B),
    motor(M),
    color(C).

% reiniciar: devuelve al robot a su estado inicial
reiniciar :-
    retractall(posicion(_, _)),
    retractall(bateria(_)),
    retractall(motor(_)),
    retractall(color(_)),
    assertz(posicion(4, 2)),
    assertz(bateria(100)),
    assertz(motor(apagado)),
    assertz(color(cian)).
