"""Genera sql/90_demo_loteamiento.sql: un loteamiento de demostracion sobre un campo real al este de Luque.

6 manzanas (2 filas x 3), la del medio de arriba es plaza; lotes de 10 x 30 m, calles de 12 m.
La grilla se rota para seguir la orientacion del campo en la imagen satelital.
Uso:  python3 sql/genera_demo.py [preview.png mosaico.png]
"""
import json, math, random, sys

LAT0, LON0 = -25.30180, -57.39457     # esquina de origen (sur del campo arado, al este de Luque)
ROT = math.radians(27)                # giro de la grilla (sentido antihorario)
LOTE_F, LOTE_P, CALLE = 10.0, 30.0, 12.0
LOTES_POR_FILA = 5
MZ_ANCHO = LOTES_POR_FILA * LOTE_F    # 50 m
MZ_PROF = 2 * LOTE_P                  # 60 m
M_LAT = 111320.0
M_LON = 111320.0 * math.cos(math.radians(LAT0))

def a_geo(x, y):
    """metros locales (x a lo largo, y a lo ancho) -> [lon, lat]"""
    xr = x * math.cos(ROT) - y * math.sin(ROT)
    yr = x * math.sin(ROT) + y * math.cos(ROT)
    return [round(LON0 + xr / M_LON, 7), round(LAT0 + yr / M_LAT, 7)]

def rect(x, y, w, h):
    pts = [a_geo(x, y), a_geo(x + w, y), a_geo(x + w, y + h), a_geo(x, y + h)]
    return pts + [pts[0]]

def feature(anillo):
    return {"type": "Feature", "properties": {}, "geometry": {"type": "Polygon", "coordinates": [anillo]}}

areas = []   # (nombre, categoria, color, anillo, m2, perimetro, extra)
total_x = 3 * MZ_ANCHO + 4 * CALLE
total_y = 2 * MZ_PROF + 3 * CALLE
# calles: 4 longitudinales... se modelan como franjas
nombres_x = ['Calle Los Lapachos', 'Calle Las Palmeras', 'Calle Los Guayabos', 'Calle Los Naranjos']
for i in range(4):
    x = i * (MZ_ANCHO + CALLE)
    areas.append((nombres_x[i], 'Calle', '#9ca3af', rect(x, 0, CALLE, total_y), CALLE * total_y, 2 * (CALLE + total_y), None))
nombres_y = ['Avenida Principal', 'Calle Central', 'Calle del Fondo']
for j in range(3):
    y = j * (MZ_PROF + CALLE)
    areas.append((nombres_y[j], 'Calle', '#9ca3af', rect(0, y, total_x, CALLE), CALLE * total_x, 2 * (CALLE + total_x), None))

letras = iter('ABCDE')
random.seed(7)
for fila in range(2):
    for col in range(3):
        x0 = CALLE + col * (MZ_ANCHO + CALLE)
        y0 = CALLE + fila * (MZ_PROF + CALLE)
        if fila == 1 and col == 1:
            areas.append(('Plaza Central', 'Plaza', '#16a34a', rect(x0, y0, MZ_ANCHO, MZ_PROF), MZ_ANCHO * MZ_PROF, 2 * (MZ_ANCHO + MZ_PROF), None))
            continue
        mz = next(letras)
        n = 0
        for f2 in range(2):                      # 0 = frente a la calle de abajo, 1 = frente a la de arriba
            for k in range(LOTES_POR_FILA):
                n += 1
                x = x0 + k * LOTE_F
                y = y0 + f2 * LOTE_P
                esquina = k in (0, LOTES_POR_FILA - 1)
                frente_plaza = (fila == 1 and f2 == 0 and False) or (fila == 0 and col == 1 and f2 == 1) or (fila == 1 and col in (0, 2) and k == (LOTES_POR_FILA - 1 if col == 0 else 0))
                frente_av = (fila == 0 and f2 == 0)
                base = 45_000_000
                precio = base * (1.15 if esquina else 1) * (1.10 if frente_plaza else 1) * (1.08 if frente_av else 1)
                precio = int(round(precio * random.uniform(0.97, 1.05) / 500_000) * 500_000)
                r = random.random()
                estado = 'VENDIDO' if r < 0.25 else 'RESERVADO' if r < 0.40 else 'DISPONIBLE'
                det = ', '.join(t for t, c in (('esquina', esquina), ('frente a la plaza', frente_plaza), ('sobre la avenida principal', frente_av)) if c)
                areas.append((f'Mz {mz} - Lote {n}', 'Lote', '#22c55e', rect(x, y, LOTE_F, LOTE_P), LOTE_F * LOTE_P, 2 * (LOTE_F + LOTE_P),
                              dict(mz=mz, n=n, estado=estado, precio=precio, esquina=esquina, detalle=det.capitalize() if det else None)))
# perimetro (para el contorno del loteamiento)
areas.append(('Loteamiento Las Palmeras', 'Perimetro', '#f59e0b', rect(0, 0, total_x, total_y), total_x * total_y, 2 * (total_x + total_y), None))

def q(s):
    return "'" + str(s).replace("'", "''") + "'" if s is not None else 'null'

out = ["-- GENERADO por sql/genera_demo.py: loteamiento de demostracion (borra lo anterior de DEMO-LOTEO).",
       "-- Un solo bloque y sin paralelismo: el servicio _medium del ADB activa PX y una carga fila por fila",
       "-- quedo colgada en 'PX Deq: Execution Msg' (ver README-LOTES.md).",
       "set define off",   # el link de Maps trae '&query=': sin esto SQLcl se queda esperando la variable
       "alter session disable parallel dml;",
       "alter session disable parallel query;",
       "begin",
       "  delete from MAP_AREA where ARE_USUARIO_CREA = 'DEMO-LOTEO';"]
for nom, cat, col, ring, m2, per, ex in areas:
    gj = json.dumps(feature(ring), separators=(',', ':'))
    out.append("  insert into MAP_AREA (ARE_NOMBRE, ARE_TIPO, ARE_CATEGORIA, ARE_COLOR, ARE_GEOJSON, ARE_AREA_M2, ARE_LONGITUD_M, ARE_ACTIVO, ARE_FECHA_CREA, ARE_USUARIO_CREA)"
               f" values ({q(nom)}, 'POLIGONO', {q(cat)}, {q(col)}, {q(gj)}, {m2:.0f}, {per:.0f}, 'S', systimestamp, 'DEMO-LOTEO');")
out.append("  LOT000.SINCRONIZAR;")
for nom, cat, col, ring, m2, per, ex in areas:
    if not ex:
        continue
    out.append("  update MAP_LOTE set LOT_ESTADO = %s, LOT_PRECIO = %d, LOT_FRENTE_M = %d, LOT_FONDO_M = %d, LOT_ESQUINA = %s, LOT_DETALLE = %s"
               " where LOT_MANZANA = %s and LOT_NUMERO = %s;" % (q(ex['estado']), ex['precio'], LOTE_F, LOTE_P, q('S' if ex['esquina'] else 'N'),
                                                              q(ex['detalle']), q(ex['mz']), q(str(ex['n']))))
out.append("  insert into MAP_LOTE_PRECIO (LPR_ARE_CODIGO, LPR_CUOTAS, LPR_TOTAL) select LOT_ARE_CODIGO, 60, 65000000 from MAP_LOTE where LOT_MANZANA = 'A' and LOT_NUMERO = '1' and LOT_ESTADO <> 'VENDIDO';")
out.append("""  update MAP_LOTEO set LOO_NOMBRE = 'Loteamiento Las Palmeras', LOO_LEMA = 'Tu terreno propio en cuotas, a 10 minutos de Luque',
    LOO_DESCRIPCION = '50 lotes de 10 x 30 m con plaza central, calles enripiadas, ANDE y agua corriente. Titulación al completar el pago.',
    LOO_UBICACION = 'Luque, Central', LOO_WHATSAPP = '595981123456', LOO_MAPS = 'https://www.google.com/maps/search/?api=1&query=%.5f,%.5f'
   where LOO_CODIGO = 1;""" % tuple(reversed(a_geo(total_x / 2, 0))))
out.append("  commit;")
out.append("end;\n/")
open('sql/90_demo_loteamiento.sql', 'w').write('\n'.join(out) + '\n')
print('areas', len(areas), 'lotes', sum(1 for a in areas if a[1] == 'Lote'))

if len(sys.argv) > 2:   # vista previa sobre el mosaico z17
    from PIL import Image, ImageDraw
    X0, Y0, Z = 44639, 75060, 17
    def px(lon, lat):
        n = 2 ** Z
        x = (lon + 180) / 360 * n
        y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
        return ((x - X0) * 256, (y - Y0) * 256)
    im = Image.open(sys.argv[2]).convert('RGBA'); ov = Image.new('RGBA', im.size); d = ImageDraw.Draw(ov)
    colores = {'Lote': (34, 197, 94, 110), 'Calle': (156, 163, 175, 120), 'Plaza': (22, 163, 74, 160), 'Perimetro': (245, 158, 11, 0)}
    for nom, cat, col, ring, *_ in areas:
        pts = [px(*p) for p in ring]
        if cat == 'Perimetro':
            d.line(pts, fill=(245, 158, 11, 255), width=2)     # solo contorno: un relleno transparente borraria lo de abajo
        else:
            d.polygon(pts, fill=colores[cat], outline=(255, 255, 255, 220))
    Image.alpha_composite(im, ov).save(sys.argv[1])
