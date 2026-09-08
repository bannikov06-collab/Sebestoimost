# KLM v32 CHANGE 05K — strict joint G isolation

## Approved rule

1. A joint, joint element, connector G, G.001.000*, 012.001.000*, or an article with the standalone G family marker is classified before any section-family matching.
2. A classified joint can never be converted into FE, CD, CP, ZD, ZDP, or another section.
3. Every joint row has the invariant L1 = 0, L2 = 0, L3 = 0.
4. A joint is shown only in the separate **Стыковочные элементы G** block and its materials are expanded only from 012.001.000СБ / G.001.000СБ.
5. A joint is included only when it is a separate row in the uploaded specification. No joint is added automatically to any section.
6. If the row is recognisable as a joint but its nominal current is missing, it remains isolated in the joint block with status **Требуется определить номинальный ток**. It must not fall through into a section calculation.

No D1 schema migration is required.
