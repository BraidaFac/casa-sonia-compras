## Purpose

Listado de cheques propios entregados y no debitados de un banco, dentro del Pago de cheques propios, con filtros, totales e impresión para controlar lo que se va a debitar.

## ADDED Requirements

### Requirement: Filtros del listado de cheques propios
El diálogo "Cheques propios a debitar" SHALL ofrecer filtro por proveedor (los contactos de los cheques listados) y por fecha de pago desde / hasta, combinables. El banco SHALL seguir fijo desde la fila. Los filtros SHALL cambiar solo lo que se ve: un cheque elegido que queda oculto sigue elegido y entra en la operación.

#### Scenario: Filtrar por proveedor
- **WHEN** el banco ICBC tiene cheques pendientes de Proveedor A y Proveedor B y el usuario elige Proveedor A
- **THEN** la tabla muestra solo los cheques de Proveedor A

#### Scenario: Filtrar por fecha de pago
- **WHEN** el usuario pone desde 10/11/2026 y hasta 15/11/2026
- **THEN** la tabla muestra solo los cheques con fecha de pago entre esas fechas, inclusive

#### Scenario: Elegido oculto por filtro
- **WHEN** el usuario elige un cheque de Proveedor B, luego filtra por Proveedor A y acepta
- **THEN** el cheque de Proveedor B queda en la operación

### Requirement: Totales del listado de cheques propios
El diálogo SHALL mostrar, sobre los cheques visibles con los filtros: total general con cantidad, total vencidos (fecha de pago hasta la fecha contable de la operación, inclusive) y total por vencer. SHALL mostrar además el total y la cantidad de cheques elegidos, sean visibles o no.

#### Scenario: Vencidos y por vencer
- **WHEN** la fecha contable es 07/11/2026 y se ven cheques de $100.000 al 05/11, $50.000 al 07/11 y $200.000 al 20/11
- **THEN** el diálogo muestra total $350.000 (3 cheques), vencidos $150.000 y por vencer $200.000

#### Scenario: Totales siguen al filtro
- **WHEN** el usuario filtra por Proveedor A
- **THEN** total, vencidos y por vencer se recalculan solo con los cheques de Proveedor A, y el total de elegidos no cambia

### Requirement: Impresión del listado de cheques propios
El diálogo SHALL tener un botón Imprimir que abre la impresión del navegador con el listado filtrado: banco, fecha contable, filtros aplicados, cheques (número, proveedor, fecha de pago, importe) y los totales del listado (general, vencidos y por vencer). La impresión SHALL ser de solo lectura: no elige cheques ni cambia la operación.

#### Scenario: Imprimir listado filtrado
- **WHEN** el usuario filtra por Proveedor A y toca Imprimir
- **THEN** se abre la impresión con el banco, el filtro "Proveedor A", solo sus cheques y sus totales

#### Scenario: Imprimir sin cheques visibles
- **WHEN** ningún cheque cumple los filtros
- **THEN** el botón Imprimir está deshabilitado
