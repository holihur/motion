# Table formulas

Table formulas calculate a cell from other cells in the same table. They run locally in the editor: no network request and no spreadsheet service are involved.

## Getting started

1. Add or open a **table** block.
2. Select a **text** column cell.
3. Type a formula beginning with `=`, for example `=A1+B1`.
4. Press Enter or click another cell. The result is displayed in the cell.

You can also use **Formula** below the table to insert a starter function, or open **Formula help** there for the in-app reference.

## Cell references

- `A1` is the first data row and first column. The header row is not counted.
- `B3` is the third data row, second column.
- `A1:B5` is a rectangular range.
- Column letters are case-insensitive.

Formulas always refer to data rows. If you add or remove rows, existing formulas keep their cell positions; adjust references if the data moves.

## Examples

| Formula | Result |
| --- | --- |
| `=A1+B1` | Add two cells |
| `=SUM(A1:A10)` | Sum a range |
| `=AVERAGE(B1:B5)` | Average a range |
| `=IF(C1>=60,"Pass","Fail")` | Conditional text |
| `=ROUND(A1/B1,2)` | Divide and round to 2 decimals |
| `=CONCAT(A1," ",B1)` | Join text from two cells |

## Operators

`+ - * / % ^ & = <> < > <= >=`

- `&` joins text.
- `^` is exponentiation.
- `%` is modulo.
- Comparisons return `TRUE` or `FALSE`.

Text strings use double quotes, for example `"Done"`. A literal double quote inside a string is written as `""`.

## Supported functions

| Group | Functions |
| --- | --- |
| Math | `SUM`, `PRODUCT`, `AVERAGE` / `AVG`, `MIN`, `MAX`, `MEDIAN`, `ABS`, `INT`, `SQRT`, `POWER`, `ROUND`, `ROUNDUP`, `ROUNDDOWN` |
| Counting | `COUNT` (numbers), `COUNTA` (non-empty), `COUNTBLANK` (empty) |
| Logic | `IF`, `IFERROR`, `AND`, `OR`, `NOT`, `TRUE`, `FALSE` |
| Text | `CONCAT` / `CONCATENATE`, `LEN`, `UPPER`, `LOWER`, `TRIM`, `TEXT` |

Ranges are flattened when passed to functions, so `SUM(A1:B10)` and `SUM(A1:A10,B1:B10)` are equivalent.

## Errors

| Value | Meaning |
| --- | --- |
| `#ERROR!` | The formula could not be parsed |
| `#REF!` | A reference is outside the table |
| `#DIV/0!` | Division by zero |
| `#NAME?` | Unknown function or name |
| `#CYCLE!` | Formulas refer to each other in a loop |
| `#VALUE!` | A value has the wrong type |
| `#NUM!` | The result is not a valid number |

## Storage and export

The table stores the computed display value in each cell so read-only views, CSV/Markdown/HTML/DOCX/PDF exports and static publishing do not need a formula evaluator. The formula expression is also kept in the table data for editing.

Formulas recalculate when a referenced cell changes. If you need to keep both the inputs and the calculation editable later, keep the source values in separate columns.
