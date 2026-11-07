-- Demo: historia de ventas del ultimo año y avance de obras de "Loteamiento Las Palmeras".
set define off
alter session disable parallel dml;
alter session disable parallel query;
begin
  delete from MAP_LOTE_HIST;
  -- todos salieron a la venta hace un año
  insert into MAP_LOTE_HIST (HIS_ARE_CODIGO, HIS_ESTADO, HIS_FECHA, HIS_USUARIO)
  select LOT_ARE_CODIGO, 'DISPONIBLE', trunc(sysdate) - 365, 'DEMO' from MAP_LOTE;
  -- vendidos: repartidos en el año, los dos ultimos recientes (hace 3 y 11 dias)
  for r in (select LOT_ARE_CODIGO, row_number() over (order by LOT_MANZANA, lpad(LOT_NUMERO, 4, '0')) N, count(*) over () T
              from MAP_LOTE where LOT_ESTADO = 'VENDIDO') loop
    insert into MAP_LOTE_HIST (HIS_ARE_CODIGO, HIS_ESTADO, HIS_FECHA, HIS_USUARIO)
    values (r.LOT_ARE_CODIGO, 'VENDIDO',
            case when r.N = r.T then trunc(sysdate) - 3 + 15/24 when r.N = r.T - 1 then trunc(sysdate) - 11 + 10/24
                 else trunc(sysdate) - 340 + round((r.N - 1) * 300 / greatest(r.T - 2, 1)) end, 'DEMO');
  end loop;
  -- reservados: en el ultimo mes
  for r in (select LOT_ARE_CODIGO, row_number() over (order by LOT_ARE_CODIGO) N from MAP_LOTE where LOT_ESTADO = 'RESERVADO') loop
    insert into MAP_LOTE_HIST (HIS_ARE_CODIGO, HIS_ESTADO, HIS_FECHA, HIS_USUARIO)
    values (r.LOT_ARE_CODIGO, 'RESERVADO', trunc(sysdate) - mod(r.N * 7, 30) - 1, 'DEMO');
  end loop;

  delete from MAP_LOTEO_OBRA;
  insert into MAP_LOTEO_OBRA (OBR_TITULO, OBR_DESCRIPCION, OBR_ESTADO, OBR_FECHA, OBR_ORDEN) values
    ('Mensura y amojonamiento', 'Cada lote con sus mojones y plano aprobado por la municipalidad.', 'HECHO', trunc(sysdate) - 330, 10);
  insert into MAP_LOTEO_OBRA (OBR_TITULO, OBR_DESCRIPCION, OBR_ESTADO, OBR_FECHA, OBR_ORDEN) values
    ('Apertura de calles', 'Calles de 12 m abiertas y niveladas.', 'HECHO', trunc(sysdate) - 260, 20);
  insert into MAP_LOTEO_OBRA (OBR_TITULO, OBR_DESCRIPCION, OBR_ESTADO, OBR_FECHA, OBR_ORDEN) values
    ('Enripiado', 'Ripio compactado en todas las calles internas.', 'HECHO', trunc(sysdate) - 150, 30);
  insert into MAP_LOTEO_OBRA (OBR_TITULO, OBR_DESCRIPCION, OBR_ESTADO, OBR_FECHA, OBR_ORDEN) values
    ('Energía eléctrica (ANDE)', 'Postes y tendido de media y baja tensión.', 'HECHO', trunc(sysdate) - 60, 40);
  insert into MAP_LOTEO_OBRA (OBR_TITULO, OBR_DESCRIPCION, OBR_ESTADO, OBR_FECHA, OBR_ORDEN) values
    ('Agua corriente', 'Red de distribución y pozo artesiano. Avance aproximado del 60%.', 'EN_CURSO', trunc(sysdate) + 45, 50);
  insert into MAP_LOTEO_OBRA (OBR_TITULO, OBR_DESCRIPCION, OBR_ESTADO, OBR_FECHA, OBR_ORDEN) values
    ('Plaza central', 'Juegos, bancos y arborización.', 'PENDIENTE', trunc(sysdate) + 120, 60);
  commit;
end;
/
