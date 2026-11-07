-- ============================================================================
--  Plano de venta de lotes - paquete LOT000.
--    AJAX_PUBLICO  pagina publica (sin login): solo lee, nunca devuelve notas internas
--    AJAX          pagina de gestion (con login)
--    OG / OG_IMAGEN  vista previa al compartir (Open Graph)
--  Se puede volver a ejecutar (create or replace).
-- ============================================================================
-- set define off: el paquete tiene URLs con "&" (SQLcl lo tomaria como variable y se quedaria esperando)
set define off
-- LOT000 - Venta de lotes sobre MAP_AREA.
--   AJAX_PUBLICO  pagina 59 (sin login): plano, lotes publicos y planes de pago
--   AJAX          pagina 60 (con login): datos del loteamiento, planes y lotes
--
-- La respuesta publica se arma con SQL/JSON para pasar el GeoJSON de MAP_AREA tal cual
-- (format json). Nunca incluye LOT_NOTA ni lotes con LOT_PUBLICO = 'N'.

create or replace package LOT000 as
  procedure AJAX_PUBLICO;
  procedure AJAX;
  -- crea la fila de MAP_LOTE para cada area de categoria 'Lote' que todavia no la tenga
  procedure SINCRONIZAR;
  -- Open Graph de la pagina 59: titulo, descripcion e imagen del lote (o del loteamiento si P_LOTE es null)
  procedure OG (P_LOTE varchar2, O_TITULO out varchar2, O_DESC out varchar2, O_IMG out varchar2, O_URL out varchar2);
  -- pagina 61: entrega la imagen de vista previa
  procedure OG_IMAGEN (P_CLAVE varchar2);
end LOT000;
/

create or replace package body LOT000 as

  procedure ERR (P_MSG varchar2) is
  begin
    raise_application_error(-20100, P_MSG);
  end;

  procedure EMITIR (P_CLOB clob) is
    off pls_integer := 1;
    len pls_integer := nvl(dbms_lob.getlength(P_CLOB), 0);
  begin
    while off <= len loop
      htp.prn(dbms_lob.substr(P_CLOB, 8000, off));
      off := off + 8000;
    end loop;
  end;

  procedure OK (P_MSG varchar2 default null) is
  begin
    htp.prn('{"ok":true' || case when P_MSG is not null then ',"msg":"' || apex_escape.json(P_MSG) || '"' end || '}');
  end;

  procedure MANEJAR_ERROR is
    l varchar2(4000) := sqlerrm;
  begin
    rollback;
    if sqlcode = -20100 then
      l := regexp_replace(l, '^ORA-20100: ', '');
    elsif sqlcode = -1 and instr(l, 'MAP_LOTE_UK') > 0 then
      l := 'Ya existe otro lote con esa manzana y número.';
    elsif sqlcode = -1 and instr(l, 'MAP_LOTEO_PLAN_UK') > 0 then
      l := 'Hay dos planes con la misma cantidad de cuotas.';
    else
      apex_debug.error('LOT000: %s %s', l, dbms_utility.format_error_backtrace);
      l := 'Ocurrió un error. Intentá de nuevo. (' || regexp_replace(l, '^ORA-\d+: ', '') || ')';
    end if;
    htp.prn('{"ok":false,"msg":"' || apex_escape.json(l) || '"}');
  end;

  function S (P json_object_t, K varchar2) return varchar2 is
  begin
    return trim(P.get_string(K));
  end;

  function N (P json_object_t, K varchar2) return number is
    l_txt varchar2(100);
  begin
    if not P.has(K) or P.get(K).is_null then return null; end if;
    if P.get(K).is_number then return P.get_number(K); end if;
    l_txt := regexp_replace(P.get_string(K), '[^0-9,]', '');
    if l_txt is null then return null; end if;
    return to_number(replace(l_txt, ',', '.'));
  end;

  function NORM_TEL (P_TEL varchar2) return varchar2 is
    l varchar2(40) := regexp_replace(P_TEL, '[^0-9]', '');
  begin
    if l is null then return null; end if;
    if l like '0%' then l := '595' || substr(l, 2); elsif l not like '595%' then l := '595' || l; end if;
    if not regexp_like(l, '^595[1-9][0-9]{7,8}$') then ERR('El WhatsApp no es válido. Ej: 0981 123 456'); end if;
    return l;
  end;

  function AHORA return date is
  begin
    return cast(systimestamp at time zone 'America/Asuncion' as date);
  end;

  procedure HIST (P_ARE number, P_EST varchar2) is
    l_usu varchar2(100) := nvl(v('APP_USER'), user);
    l_now date := AHORA;
  begin
    insert into MAP_LOTE_HIST (HIS_ARE_CODIGO, HIS_ESTADO, HIS_FECHA, HIS_USUARIO) values (P_ARE, P_EST, l_now, l_usu);
  end;

  function USUARIO return varchar2 is
  begin
    return nvl(v('APP_USER'), user);
  end;

  ---------------------------------------------------------------------------
  procedure SINCRONIZAR is
    l_usu varchar2(100) := USUARIO;   -- funcion privada: no se puede llamar dentro del insert
  begin
    insert into MAP_LOTE (LOT_ARE_CODIGO, LOT_MANZANA, LOT_NUMERO, LOT_FECHA_MOD, LOT_USUARIO_MOD)
    select a.ARE_CODIGO,
           -- "Mz A - Lote 5" -> manzana A, numero 5; si no se puede leer, queda S/M + codigo
           nvl(upper(regexp_substr(a.ARE_NOMBRE, 'm(an)?z(ana)?\.?\s*([A-Za-z0-9]+)', 1, 1, 'i', 3)), 'S/M'),
           nvl(regexp_substr(a.ARE_NOMBRE, 'lote\s*([0-9A-Za-z]+)', 1, 1, 'i', 1), to_char(a.ARE_CODIGO)),
           sysdate, l_usu
      from MAP_AREA a
     where lower(a.ARE_CATEGORIA) = 'lote' and a.ARE_TIPO = 'POLIGONO'
       and not exists (select 1 from MAP_LOTE l where l.LOT_ARE_CODIGO = a.ARE_CODIGO);
  exception when dup_val_on_index then
    -- dos areas con el mismo "Mz/Lote" en el nombre: se dan de alta con su codigo
    insert into MAP_LOTE (LOT_ARE_CODIGO, LOT_MANZANA, LOT_NUMERO, LOT_FECHA_MOD, LOT_USUARIO_MOD)
    select a.ARE_CODIGO, 'S/M', to_char(a.ARE_CODIGO), sysdate, l_usu
      from MAP_AREA a
     where lower(a.ARE_CATEGORIA) = 'lote' and a.ARE_TIPO = 'POLIGONO'
       and not exists (select 1 from MAP_LOTE l where l.LOT_ARE_CODIGO = a.ARE_CODIGO);
  end;

  ---------------------------------------------------------------------------
  -- OPEN GRAPH (lo lee WhatsApp/Facebook, que no ejecutan JS: va en el <head> desde el servidor)
  ---------------------------------------------------------------------------
  function GS (P number) return varchar2 is
  begin
    return 'Gs. ' || trim(to_char(P, '999G999G999G999', 'NLS_NUMERIC_CHARACTERS='',.'''));
  end;

  -- cuota mas baja posible (plan de mas cuotas con la entrega minima), igual que el simulador
  function CUOTA_DESDE (P_ARE number, P_PRECIO number, O_CUOTAS out number) return number is
    l_best number; l_tot number; l_ent number; l_c number; l_esp number;
  begin
    for p in (select * from MAP_LOTEO_PLAN where PLA_ACTIVO = 'S' and PLA_CUOTAS > 0) loop
      begin
        select LPR_TOTAL into l_esp from MAP_LOTE_PRECIO where LPR_ARE_CODIGO = P_ARE and LPR_CUOTAS = p.PLA_CUOTAS;
      exception when no_data_found then l_esp := null;
      end;
      l_tot := nvl(l_esp, round(P_PRECIO * (1 + p.PLA_RECARGO_PCT / 100) / 1000) * 1000);
      l_ent := round(l_tot * p.PLA_ENTREGA_PCT / 100 / 1000) * 1000;
      l_c   := ceil((l_tot - l_ent) / p.PLA_CUOTAS / 1000) * 1000;
      if l_best is null or l_c < l_best then l_best := l_c; O_CUOTAS := p.PLA_CUOTAS; end if;
    end loop;
    return l_best;
  end;

  procedure OG (P_LOTE varchar2, O_TITULO out varchar2, O_DESC out varchar2, O_IMG out varchar2, O_URL out varchar2) is
    l_id    number := to_number(regexp_substr(P_LOTE, '^\d+$'));
    l_nom   varchar2(200); l_desc varchar2(2000); l_ubi varchar2(300);
    l_base  varchar2(1000);
    l_cuo   number; l_n number; l_desde number; l_disp number;
    l_clave number := 0;
    l_img   number;
  begin
    -- URL absoluta a partir del pedido actual: https://host/ords/r/<ws>/<app>/
    l_base := 'https://' || owa_util.get_cgi_env('HTTP_HOST') || owa_util.get_cgi_env('SCRIPT_NAME')
              || regexp_replace(owa_util.get_cgi_env('PATH_INFO'), '/[^/]*$', '/');
    -- la pagina imprime las URLs sin escapar (!RAW): solo caracteres validos de URL, nada de comillas ni < >
    l_base := regexp_replace(l_base, '[^A-Za-z0-9._~:/?@!$()*+,;=%-]', '');
    select LOO_NOMBRE, nvl(LOO_LEMA, LOO_DESCRIPCION), LOO_UBICACION into l_nom, l_desc, l_ubi from MAP_LOTEO where LOO_CODIGO = 1;
    O_TITULO := l_nom; O_URL := l_base || 'loteamiento';
    select count(*), min(LOT_PRECIO) into l_disp, l_desde from MAP_LOTE where LOT_ESTADO = 'DISPONIBLE' and LOT_PUBLICO = 'S';
    O_DESC := substr(l_disp || ' lotes disponibles' || case when l_desde is not null then ' desde ' || GS(l_desde) end
              || case when l_ubi is not null then ' · ' || l_ubi end || '. ' || l_desc, 1, 300);
    if l_id is not null then
      for l in (select * from MAP_LOTE x join MAP_AREA a on a.ARE_CODIGO = x.LOT_ARE_CODIGO where x.LOT_ARE_CODIGO = l_id and x.LOT_PUBLICO = 'S') loop
        O_TITULO := 'Lote ' || l.LOT_NUMERO || ' · Manzana ' || l.LOT_MANZANA || ' — ' || l_nom;
        O_URL := l_base || 'loteamiento?lote=' || l_id;
        if l.LOT_ESTADO = 'VENDIDO' then
          O_DESC := round(l.ARE_AREA_M2) || ' m² · Vendido. Mirá los lotes disponibles en el plano.';
        else
          l_cuo := CUOTA_DESDE(l_id, l.LOT_PRECIO, l_n);
          O_DESC := round(l.ARE_AREA_M2) || ' m²' || case when l.LOT_FRENTE_M is not null then ' (' || l.LOT_FRENTE_M || ' × ' || l.LOT_FONDO_M || ' m)' end
                    || case when l.LOT_ESQUINA = 'S' then ' · esquina' end
                    || ' · ' || initcap(l.LOT_ESTADO) || ' · ' || GS(l.LOT_PRECIO) || ' contado'
                    || case when l_cuo is not null then ' o ' || l_n || ' cuotas de ' || GS(l_cuo) end || '.';
        end if;
        l_clave := l_id;
      end loop;
    end if;
    select count(*) into l_img from MAP_LOTE_OG where OG_CLAVE = l_clave;
    if l_img = 0 then l_clave := 0; select count(*) into l_img from MAP_LOTE_OG where OG_CLAVE = 0; end if;
    if l_img > 0 then
      select O_IMG_V into O_IMG from (select l_base || 'lot-og?p61_id=' || OG_CLAVE || '&p61_v=' || to_char(OG_FECHA, 'YYYYMMDDHH24MISS') O_IMG_V
                                        from MAP_LOTE_OG where OG_CLAVE = l_clave);
    end if;
  end;

  procedure OG_IMAGEN (P_CLAVE varchar2) is
    l_blob blob; l_mime varchar2(30);
  begin
    select OG_IMG, OG_MIME into l_blob, l_mime from MAP_LOTE_OG where OG_CLAVE = to_number(regexp_substr(P_CLAVE, '^\d+$'));
    owa_util.mime_header(l_mime, false);
    htp.p('Content-Length: ' || dbms_lob.getlength(l_blob));
    htp.p('Cache-Control: public, max-age=86400');
    owa_util.http_header_close;
    wpg_docload.download_file(l_blob);
  exception when no_data_found then
    owa_util.status_line(404, 'Not Found', true);
  end;

  ---------------------------------------------------------------------------
  -- PUBLICO
  ---------------------------------------------------------------------------
  procedure P_INFO is
    l     clob;
    l_now date := AHORA;
  begin
    select json_object(
             'ok' value 'true' format json,
             'loteo' value (select json_object('nombre' value LOO_NOMBRE, 'lema' value LOO_LEMA, 'descripcion' value LOO_DESCRIPCION,
                                               'ubicacion' value LOO_UBICACION, 'whatsapp' value LOO_WHATSAPP, 'maps' value LOO_MAPS,
                                               'retiros' value json_object('frente' value LOO_RETIRO_FRENTE, 'lateral' value LOO_RETIRO_LATERAL,
                                                                           'fondo' value LOO_RETIRO_FONDO),
                                               'visitaDias' value LOO_VISITA_DIAS, 'visitaHoras' value LOO_VISITA_HORAS, 'reservaHs' value LOO_RESERVA_HS,
                                               'hoy' value to_char(l_now, 'YYYY-MM-DD'))
                              from MAP_LOTEO where LOO_CODIGO = 1),
             -- ventas para la animacion "asi se fue vendiendo" (solo fecha, nada personal)
             'ventas' value (select json_arrayagg(json_object('id' value h.HIS_ARE_CODIGO, 'fecha' value to_char(h.HIS_FECHA, 'YYYY-MM-DD')) order by h.HIS_FECHA returning clob)
                               from MAP_LOTE_HIST h join MAP_LOTE l on l.LOT_ARE_CODIGO = h.HIS_ARE_CODIGO
                              where h.HIS_ESTADO = 'VENDIDO' and l.LOT_ESTADO = 'VENDIDO' and l.LOT_PUBLICO = 'S'
                                and h.HIS_FECHA = (select max(x.HIS_FECHA) from MAP_LOTE_HIST x where x.HIS_ARE_CODIGO = h.HIS_ARE_CODIGO and x.HIS_ESTADO = 'VENDIDO')),
             'inicio' value (select to_char(min(HIS_FECHA), 'YYYY-MM-DD') from MAP_LOTE_HIST),
             'obras' value (select json_arrayagg(json_object('id' value OBR_CODIGO, 'titulo' value OBR_TITULO, 'descripcion' value OBR_DESCRIPCION,
                                                             'estado' value OBR_ESTADO, 'fecha' value to_char(OBR_FECHA, 'YYYY-MM-DD'),
                                                             'foto' value case when OBR_FOTO is not null then 'true' else 'false' end format json)
                                                 order by OBR_ORDEN, OBR_CODIGO returning clob) from MAP_LOTEO_OBRA),
             'pois' value (select json_arrayagg(json_object('categoria' value POI_CATEGORIA, 'nombre' value POI_NOMBRE, 'lat' value POI_LAT,
                                                            'lng' value POI_LNG, 'dist' value POI_DIST_M) order by POI_DIST_M returning clob)
                             from MAP_LOTEO_POI where POI_ACTIVO = 'S'),
             'planes' value (select json_arrayagg(json_object('cuotas' value PLA_CUOTAS, 'recargo' value PLA_RECARGO_PCT,
                                                              'entrega' value PLA_ENTREGA_PCT) order by PLA_CUOTAS returning clob)
                               from MAP_LOTEO_PLAN where PLA_ACTIVO = 'S'),
             'lotes' value (select json_arrayagg(json_object(
                                     'id' value a.ARE_CODIGO, 'manzana' value l.LOT_MANZANA, 'numero' value l.LOT_NUMERO,
                                     'estado' value l.LOT_ESTADO, 'm2' value round(a.ARE_AREA_M2),
                                     'frente' value l.LOT_FRENTE_M, 'fondo' value l.LOT_FONDO_M,
                                     'esquina' value case l.LOT_ESQUINA when 'S' then 'true' else 'false' end format json,
                                     'detalle' value l.LOT_DETALLE,
                                     -- hace cuantos dias cambio al estado actual (para "vendido hace 3 dias")
                                     -- dias julianos: la resta de fechas con un bind puede tiparse como intervalo y json_object no lo acepta
                                     'dias' value (select to_number(to_char(l_now, 'J')) - to_number(to_char(max(h.HIS_FECHA), 'J')) from MAP_LOTE_HIST h
                                                    where h.HIS_ARE_CODIGO = a.ARE_CODIGO and h.HIS_ESTADO = l.LOT_ESTADO),
                                     -- pre-reserva online vigente (pendiente de aprobacion del vendedor)
                                     'prereserva' value case when exists (select 1 from MAP_LOTE_SOLICITUD s where s.SOL_ARE_CODIGO = a.ARE_CODIGO
                                                                and s.SOL_TIPO = 'RESERVA' and s.SOL_ESTADO = 'PENDIENTE' and s.SOL_VENCE > l_now)
                                                             then 'true' else 'false' end format json,
                                     -- precio solo si se puede comprar
                                     'precio' value case when l.LOT_ESTADO <> 'VENDIDO' then l.LOT_PRECIO end,
                                     'especiales' value (select json_objectagg(key to_char(p.LPR_CUOTAS) value p.LPR_TOTAL)
                                                           from MAP_LOTE_PRECIO p where p.LPR_ARE_CODIGO = a.ARE_CODIGO and l.LOT_ESTADO <> 'VENDIDO'),
                                     'geo' value a.ARE_GEOJSON format json
                                     absent on null returning clob) order by l.LOT_MANZANA, lpad(l.LOT_NUMERO, 6, '0') returning clob)
                              from MAP_LOTE l join MAP_AREA a on a.ARE_CODIGO = l.LOT_ARE_CODIGO
                             where l.LOT_PUBLICO = 'S' and nvl(a.ARE_ACTIVO, 'S') = 'S'
                               and (l.LOT_ESTADO <> 'VENDIDO' or (select LOO_MOSTRAR_VENDIDOS from MAP_LOTEO where LOO_CODIGO = 1) = 'S')),
             -- todo lo que no es lote: calles, plazas, areas verdes, perimetro
             'entorno' value (select json_arrayagg(json_object('nombre' value a.ARE_NOMBRE, 'categoria' value a.ARE_CATEGORIA,
                                                               'color' value a.ARE_COLOR, 'tipo' value a.ARE_TIPO,
                                                               'geo' value a.ARE_GEOJSON format json returning clob) returning clob)
                                from MAP_AREA a
                               where nvl(a.ARE_ACTIVO, 'S') = 'S' and lower(nvl(a.ARE_CATEGORIA, '-')) <> 'lote')
             absent on null returning clob)
      into l from dual;
    EMITIR(l);
  end;

  -- Horarios de visita de un dia: los configurados, sin los que ya pasaron ni los tomados.
  procedure P_VISITA_HORAS (P json_object_t) is
    l_f    date := to_date(S(P, 'fecha'), 'YYYY-MM-DD');
    l_now  date := AHORA;
    l_dias varchar2(40); l_horas varchar2(400);
    l_dia  number;
    l_h    varchar2(10);
    l_ini  date;
    l_n    number;
    l      clob;
    l_prim boolean := true;
  begin
    select LOO_VISITA_DIAS, LOO_VISITA_HORAS into l_dias, l_horas from MAP_LOTEO where LOO_CODIGO = 1;
    l_dia := trunc(l_f) - trunc(l_f, 'IW') + 1;
    l := '{"ok":true,"fecha":"' || to_char(l_f, 'YYYY-MM-DD') || '","horas":[';
    if instr(',' || l_dias || ',', ',' || l_dia || ',') > 0 and trunc(l_f) between trunc(l_now) and trunc(l_now) + 30 then
      for i in 1 .. regexp_count(l_horas, '[^,]+') loop
        l_h := trim(regexp_substr(l_horas, '[^,]+', 1, i));
        l_ini := l_f + to_number(substr(l_h, 1, 2)) / 24 + to_number(substr(l_h, 4, 2)) / 1440;
        if l_ini > l_now + 1/24 then
          select count(*) into l_n from MAP_LOTE_SOLICITUD where SOL_TIPO = 'VISITA' and SOL_ESTADO in ('PENDIENTE','CONFIRMADA') and SOL_VISITA = l_ini;
          l := l || case when not l_prim then ',' end || '{"hora":"' || l_h || '","libre":' || case when l_n = 0 then 'true' else 'false' end || '}';
          l_prim := false;
        end if;
      end loop;
    end if;
    EMITIR(l || ']}');
  end;

  procedure P_SOLICITAR (P json_object_t) is
    l_tipo  varchar2(20)  := S(P, 'tipo');
    l_are   number        := N(P, 'lote');
    l_nom   varchar2(400) := substr(S(P, 'nombre'), 1, 120);
    l_tel   varchar2(40)  := NORM_TEL(S(P, 'telefono'));
    l_nota  varchar2(2000) := substr(S(P, 'nota'), 1, 500);
    l_now   date := AHORA;
    l_vis   date;
    l_est   varchar2(20);
    l_pub   varchar2(1);
    l_n     number;
    l_hs    number;
    l_vence date;
    l_lock  number;
  begin
    if l_tipo not in ('VISITA','AVISO','RESERVA') then ERR('Solicitud inválida.'); end if;
    if l_nom is null or length(l_nom) < 2 then ERR('Escribí tu nombre.'); end if;
    if l_tel is null then ERR('Escribí tu WhatsApp.'); end if;
    -- freno al spam: hasta 5 solicitudes por telefono por dia
    select count(*) into l_n from MAP_LOTE_SOLICITUD where SOL_TELEFONO = l_tel and SOL_CREADO > l_now - 1;
    if l_n >= 5 then ERR('Ya recibimos varias solicitudes de este número hoy. El vendedor te va a contactar.'); end if;
    if l_are is not null or l_tipo <> 'VISITA' then
      begin
        select LOT_ESTADO, LOT_PUBLICO into l_est, l_pub from MAP_LOTE where LOT_ARE_CODIGO = l_are;
      exception when no_data_found then ERR('Lote inexistente.');
      end;
      if l_pub = 'N' then ERR('Lote inexistente.'); end if;
    end if;
    if l_tipo = 'VISITA' then
      begin
        l_vis := to_date(S(P, 'fecha') || ' ' || S(P, 'hora'), 'YYYY-MM-DD HH24:MI');
      exception when others then ERR('Elegí el día y la hora de la visita.');
      end;
      if l_vis < l_now + 1/24 then ERR('Elegí un horario a partir de dentro de una hora.'); end if;
      -- serializar: dos clientes no pueden tomar el mismo horario
      select LOO_CODIGO into l_lock from MAP_LOTEO where LOO_CODIGO = 1 for update;
      select count(*) into l_n from MAP_LOTE_SOLICITUD where SOL_TIPO = 'VISITA' and SOL_ESTADO in ('PENDIENTE','CONFIRMADA') and SOL_VISITA = l_vis;
      if l_n > 0 then ERR('Ese horario se acaba de ocupar. Elegí otro.'); end if;
    elsif l_tipo = 'RESERVA' then
      select LOO_CODIGO, LOO_RESERVA_HS into l_lock, l_hs from MAP_LOTEO where LOO_CODIGO = 1 for update;
      if l_est <> 'DISPONIBLE' then ERR('Este lote ya no está disponible.'); end if;
      select count(*) into l_n from MAP_LOTE_SOLICITUD where SOL_ARE_CODIGO = l_are and SOL_TIPO = 'RESERVA' and SOL_ESTADO = 'PENDIENTE' and SOL_VENCE > l_now;
      if l_n > 0 then ERR('Alguien acaba de pre-reservar este lote. Dejá tu WhatsApp con "Avisame si se libera".'); end if;
      l_vence := l_now + l_hs / 24;
    else -- AVISO
      if l_est = 'DISPONIBLE' then
        select count(*) into l_n from MAP_LOTE_SOLICITUD where SOL_ARE_CODIGO = l_are and SOL_TIPO = 'RESERVA' and SOL_ESTADO = 'PENDIENTE' and SOL_VENCE > l_now;
        if l_n = 0 then ERR('Este lote está disponible: podés reservarlo ahora.'); end if;
      end if;
      select count(*) into l_n from MAP_LOTE_SOLICITUD where SOL_ARE_CODIGO = l_are and SOL_TIPO = 'AVISO' and SOL_TELEFONO = l_tel and SOL_ESTADO = 'PENDIENTE';
      if l_n > 0 then ERR('Ya te anotaste: te avisamos apenas se libere.'); end if;
    end if;
    insert into MAP_LOTE_SOLICITUD (SOL_ARE_CODIGO, SOL_TIPO, SOL_NOMBRE, SOL_TELEFONO, SOL_VISITA, SOL_NOTA, SOL_VENCE, SOL_CREADO)
    values (l_are, l_tipo, l_nom, l_tel, l_vis, l_nota, l_vence, l_now);
    commit;
    EMITIR('{"ok":true,"msg":"' || apex_escape.json(case l_tipo
      when 'VISITA' then 'Visita agendada para el ' || to_char(l_vis, 'DD/MM') || ' a las ' || to_char(l_vis, 'HH24:MI') || '. El vendedor te escribe para confirmar.'
      when 'RESERVA' then 'Lote pre-reservado hasta el ' || to_char(l_vence, 'DD/MM HH24:MI') || '. El vendedor te escribe para coordinar la seña.'
      else 'Listo: te avisamos por WhatsApp apenas se libere.' end) || '"'
      || case when l_vence is not null then ',"vence":"' || to_char(l_vence, 'YYYY-MM-DD HH24:MI') || '"' end || '}');
  end;

  -- Foto de una obra como data-URL (son pocas y chicas: se achican en el navegador antes de subir)
  procedure P_OBRA_FOTO (P json_object_t) is
    l_id   number := N(P, 'id');
    l_blob blob; l_mime varchar2(60);
  begin
    select OBR_FOTO, OBR_FOTO_MIME into l_blob, l_mime from MAP_LOTEO_OBRA where OBR_CODIGO = l_id;
    if l_blob is null then ERR('Sin foto'); end if;
    EMITIR('{"ok":true,"src":"data:' || l_mime || ';base64,');
    EMITIR(replace(replace(apex_web_service.blob2clobbase64(l_blob), chr(10)), chr(13)));
    EMITIR('"}');
  exception when no_data_found then ERR('Obra inexistente');
  end;

  procedure AJAX_PUBLICO is
    l_p json_object_t;
  begin
    l_p := json_object_t.parse(nvl(apex_application.g_x02, '{}'));
    case apex_application.g_x01
      when 'INFO' then P_INFO;
      when 'VISITA_HORAS' then P_VISITA_HORAS(l_p);
      when 'SOLICITAR' then P_SOLICITAR(l_p);
      when 'OBRA_FOTO' then P_OBRA_FOTO(l_p);
      else ERR('Acción desconocida');
    end case;
  exception when others then
    MANEJAR_ERROR;
  end;

  ---------------------------------------------------------------------------
  -- ADMIN
  ---------------------------------------------------------------------------
  -- URL amigable de la pagina publica (alias LOTEAMIENTO), sin sesion: https://host/ords/r/<workspace>/<app>/loteamiento.
  -- La arma el servidor porque el panel puede haberse abierto con f?p=... y desde ahi no se deduce.
  function URL_PUBLICA return varchar2 is
    l_ws varchar2(255);
  begin
    select lower(PATH_PREFIX) into l_ws from APEX_WORKSPACES where WORKSPACE_ID = apex_custom_auth.get_security_group_id;
    return apex_util.host_url('SCRIPT') || 'r/' || l_ws || '/' || lower(v('APP_ALIAS')) || '/loteamiento';
  exception when others then return null;
  end;

  procedure X_RESUMEN is
    l     clob;
    l_now date := AHORA;
    l_pub varchar2(1000) := URL_PUBLICA;
  begin
    SINCRONIZAR;
    -- pre-reservas que pasaron su plazo: vuelven a liberar el lote
    update MAP_LOTE_SOLICITUD set SOL_ESTADO = 'VENCIDA' where SOL_TIPO = 'RESERVA' and SOL_ESTADO = 'PENDIENTE' and SOL_VENCE <= l_now;
    commit;
    select json_object(
             'publico' value l_pub,
             'ok' value 'true' format json,
             'loteo' value (select json_object('nombre' value LOO_NOMBRE, 'lema' value LOO_LEMA, 'descripcion' value LOO_DESCRIPCION,
                                               'ubicacion' value LOO_UBICACION, 'whatsapp' value LOO_WHATSAPP, 'maps' value LOO_MAPS,
                                               'mostrarVendidos' value case LOO_MOSTRAR_VENDIDOS when 'S' then 'true' else 'false' end format json,
                                               'retiroFrente' value LOO_RETIRO_FRENTE, 'retiroLateral' value LOO_RETIRO_LATERAL,
                                               'retiroFondo' value LOO_RETIRO_FONDO, 'poiRadio' value LOO_POI_RADIO,
                                               'poiFecha' value to_char(LOO_POI_FECHA, 'YYYY-MM-DD HH24:MI'),
                                               'visitaDias' value LOO_VISITA_DIAS, 'visitaHoras' value LOO_VISITA_HORAS, 'reservaHs' value LOO_RESERVA_HS)
                              from MAP_LOTEO where LOO_CODIGO = 1),
             'solicitudes' value (select json_arrayagg(json_object('id' value s.SOL_CODIGO, 'tipo' value s.SOL_TIPO, 'lote' value s.SOL_ARE_CODIGO,
                                     'manzana' value l.LOT_MANZANA, 'numero' value l.LOT_NUMERO, 'estadoLote' value l.LOT_ESTADO,
                                     'nombre' value s.SOL_NOMBRE, 'telefono' value s.SOL_TELEFONO, 'nota' value s.SOL_NOTA,
                                     'visita' value to_char(s.SOL_VISITA, 'YYYY-MM-DD HH24:MI'), 'vence' value to_char(s.SOL_VENCE, 'YYYY-MM-DD HH24:MI'),
                                     'estado' value s.SOL_ESTADO, 'creado' value to_char(s.SOL_CREADO, 'YYYY-MM-DD HH24:MI')
                                     absent on null) order by case s.SOL_ESTADO when 'PENDIENTE' then 0 when 'CONFIRMADA' then 1 else 2 end,
                                     nvl(s.SOL_VISITA, s.SOL_CREADO) returning clob)
                                    from MAP_LOTE_SOLICITUD s left join MAP_LOTE l on l.LOT_ARE_CODIGO = s.SOL_ARE_CODIGO
                                   where s.SOL_ESTADO in ('PENDIENTE','CONFIRMADA') or s.SOL_CREADO > l_now - 30),
             'obras' value (select json_arrayagg(json_object('id' value OBR_CODIGO, 'titulo' value OBR_TITULO, 'descripcion' value OBR_DESCRIPCION,
                                                             'estado' value OBR_ESTADO, 'fecha' value to_char(OBR_FECHA, 'YYYY-MM-DD'), 'orden' value OBR_ORDEN,
                                                             'foto' value case when OBR_FOTO is not null then 'true' else 'false' end format json)
                                                 order by OBR_ORDEN, OBR_CODIGO returning clob) from MAP_LOTEO_OBRA),
             -- centro aproximado del loteamiento (promedio del primer vertice de cada lote) para buscar el entorno
             'centro' value (select json_object('lng' value round(avg(json_value(a.ARE_GEOJSON, '$.geometry.coordinates[0][0][0]' returning number)), 6),
                                                'lat' value round(avg(json_value(a.ARE_GEOJSON, '$.geometry.coordinates[0][0][1]' returning number)), 6))
                               from MAP_LOTE l join MAP_AREA a on a.ARE_CODIGO = l.LOT_ARE_CODIGO),
             'pois' value (select json_arrayagg(json_object('id' value POI_CODIGO, 'categoria' value POI_CATEGORIA, 'nombre' value POI_NOMBRE,
                                                            'dist' value POI_DIST_M,
                                                            'activo' value case POI_ACTIVO when 'S' then 'true' else 'false' end format json)
                                                order by POI_CATEGORIA, POI_DIST_M returning clob) from MAP_LOTEO_POI),
             'planes' value (select json_arrayagg(json_object('id' value PLA_CODIGO, 'cuotas' value PLA_CUOTAS, 'recargo' value PLA_RECARGO_PCT,
                                                              'entrega' value PLA_ENTREGA_PCT,
                                                              'activo' value case PLA_ACTIVO when 'S' then 'true' else 'false' end format json)
                                                  order by PLA_CUOTAS returning clob) from MAP_LOTEO_PLAN),
             'lotes' value (select json_arrayagg(json_object(
                                     'id' value a.ARE_CODIGO, 'area' value a.ARE_NOMBRE, 'manzana' value l.LOT_MANZANA, 'numero' value l.LOT_NUMERO,
                                     'estado' value l.LOT_ESTADO, 'm2' value round(a.ARE_AREA_M2), 'precio' value l.LOT_PRECIO,
                                     'frente' value l.LOT_FRENTE_M, 'fondo' value l.LOT_FONDO_M,
                                     'esquina' value case l.LOT_ESQUINA when 'S' then 'true' else 'false' end format json,
                                     'publico' value case l.LOT_PUBLICO when 'S' then 'true' else 'false' end format json,
                                     'detalle' value l.LOT_DETALLE, 'nota' value l.LOT_NOTA,
                                     'modificado' value to_char(l.LOT_FECHA_MOD, 'YYYY-MM-DD HH24:MI'), 'por' value l.LOT_USUARIO_MOD,
                                     'especiales' value (select json_objectagg(key to_char(p.LPR_CUOTAS) value p.LPR_TOTAL)
                                                           from MAP_LOTE_PRECIO p where p.LPR_ARE_CODIGO = a.ARE_CODIGO)
                                     absent on null returning clob) order by l.LOT_MANZANA, lpad(l.LOT_NUMERO, 6, '0') returning clob)
                              from MAP_LOTE l join MAP_AREA a on a.ARE_CODIGO = l.LOT_ARE_CODIGO)
             absent on null returning clob)
      into l from dual;
    EMITIR(l);
  end;

  procedure X_GUARDAR_LOTEO (P json_object_t) is
    l_nom  varchar2(400)  := substr(S(P, 'nombre'), 1, 150);
    l_lema varchar2(1000) := substr(S(P, 'lema'), 1, 250);
    l_desc varchar2(4000) := substr(S(P, 'descripcion'), 1, 2000);
    l_ubi  varchar2(1000) := substr(S(P, 'ubicacion'), 1, 250);
    l_wa   varchar2(40)   := NORM_TEL(S(P, 'whatsapp'));
    l_maps varchar2(1000) := substr(S(P, 'maps'), 1, 500);
    l_ven  varchar2(1)    := case when P.has('mostrarVendidos') and not P.get_boolean('mostrarVendidos') then 'N' else 'S' end;
    l_usu  varchar2(100)  := USUARIO;
    l_rf   number := nvl(N(P, 'retiroFrente'), 3);
    l_rl   number := nvl(N(P, 'retiroLateral'), 1.5);
    l_rb   number := nvl(N(P, 'retiroFondo'), 3);
    l_vd   varchar2(100) := nvl(S(P, 'visitaDias'), '1,2,3,4,5,6');
    l_vh   varchar2(400) := nvl(regexp_replace(S(P, 'visitaHoras'), '\s', ''), '09:00,15:00');
    l_rh   number := nvl(N(P, 'reservaHs'), 48);
  begin
    if not regexp_like(l_vd, '^[1-7](,[1-7])*$') then ERR('Días de visita inválidos.'); end if;
    if not regexp_like(l_vh, '^([01][0-9]|2[0-3]):[0-5][0-9](,([01][0-9]|2[0-3]):[0-5][0-9])*$') then ERR('Horarios de visita inválidos. Ej: 09:00,10:00,15:00'); end if;
    if l_rh < 1 or l_rh > 240 then ERR('La pre-reserva dura de 1 a 240 horas.'); end if;
    if l_nom is null then ERR('El nombre del loteamiento no puede quedar vacío.'); end if;
    if least(l_rf, l_rl, l_rb) < 0 or greatest(l_rf, l_rl, l_rb) > 30 then ERR('Los retiros van de 0 a 30 m.'); end if;
    update MAP_LOTEO set LOO_NOMBRE = l_nom, LOO_LEMA = l_lema, LOO_DESCRIPCION = l_desc, LOO_UBICACION = l_ubi,
                         LOO_WHATSAPP = l_wa, LOO_MAPS = l_maps, LOO_MOSTRAR_VENDIDOS = l_ven,
                         LOO_RETIRO_FRENTE = l_rf, LOO_RETIRO_LATERAL = l_rl, LOO_RETIRO_FONDO = l_rb,
                         LOO_VISITA_DIAS = l_vd, LOO_VISITA_HORAS = l_vh, LOO_RESERVA_HS = l_rh,
                         LOO_FECHA_MOD = sysdate, LOO_USUARIO_MOD = l_usu
     where LOO_CODIGO = 1;
    commit;
    OK('Datos del loteamiento guardados');
  end;

  procedure X_GUARDAR_PLANES (P json_object_t) is
    l_arr json_array_t := P.get_array('planes');
    o     json_object_t;
    l_c   number; l_r number; l_e number; l_a varchar2(1);
  begin
    if l_arr is null or l_arr.get_size = 0 then ERR('Tiene que haber al menos un plan.'); end if;
    delete from MAP_LOTEO_PLAN;
    for i in 0 .. l_arr.get_size - 1 loop
      o   := treat(l_arr.get(i) as json_object_t);
      l_c := N(o, 'cuotas'); l_r := nvl(N(o, 'recargo'), 0); l_e := nvl(N(o, 'entrega'), 0);
      l_a := case when o.has('activo') and not o.get_boolean('activo') then 'N' else 'S' end;
      if l_c is null or l_c < 0 or l_c > 240 or l_c <> trunc(l_c) then ERR('Las cuotas van de 0 (contado) a 240.'); end if;
      if l_r < 0 or l_r > 500 then ERR('El recargo va de 0 a 500 %.'); end if;
      if l_e < 0 or l_e > 100 then ERR('La entrega mínima va de 0 a 100 %.'); end if;
      insert into MAP_LOTEO_PLAN (PLA_CUOTAS, PLA_RECARGO_PCT, PLA_ENTREGA_PCT, PLA_ACTIVO)
      values (l_c, l_r, case when l_c = 0 then 100 else l_e end, l_a);
    end loop;
    commit;
    OK('Planes guardados');
  end;

  procedure X_GUARDAR_LOTE (P json_object_t) is
    l_id   number := N(P, 'id');
    l_mz   varchar2(40)   := upper(substr(S(P, 'manzana'), 1, 10));
    l_num  varchar2(40)   := upper(substr(S(P, 'numero'), 1, 10));
    l_est  varchar2(20)   := nvl(S(P, 'estado'), 'DISPONIBLE');
    l_pre  number := N(P, 'precio');
    l_fr   number := N(P, 'frente');
    l_fo   number := N(P, 'fondo');
    l_esq  varchar2(1) := case when P.get_boolean('esquina') then 'S' else 'N' end;
    l_pub  varchar2(1) := case when P.has('publico') and not P.get_boolean('publico') then 'N' else 'S' end;
    l_det  varchar2(2000) := substr(S(P, 'detalle'), 1, 500);
    l_nota varchar2(4000) := substr(S(P, 'nota'), 1, 1000);
    l_esp  json_object_t  := P.get_object('especiales');
    l_keys json_key_list;
    l_tot  number;
    l_cuo  number;
    l_n    number;
    l_usu  varchar2(100) := USUARIO;
    l_ant  varchar2(20);
  begin
    begin
      select LOT_ESTADO into l_ant from MAP_LOTE where LOT_ARE_CODIGO = l_id for update;
    exception when no_data_found then ERR('Lote inexistente');
    end;
    if l_mz is null or l_num is null then ERR('Completá manzana y número de lote.'); end if;
    if l_est not in ('DISPONIBLE','RESERVADO','VENDIDO') then ERR('Estado inválido'); end if;
    if l_pre is not null and l_pre < 0 then ERR('El precio no puede ser negativo.'); end if;
    if l_est = 'DISPONIBLE' and nvl(l_pre, 0) = 0 and l_pub = 'S' then ERR('Un lote disponible y público necesita precio.'); end if;
    update MAP_LOTE set LOT_MANZANA = l_mz, LOT_NUMERO = l_num, LOT_ESTADO = l_est, LOT_PRECIO = round(l_pre),
                        LOT_FRENTE_M = l_fr, LOT_FONDO_M = l_fo, LOT_ESQUINA = l_esq, LOT_PUBLICO = l_pub,
                        LOT_DETALLE = l_det, LOT_NOTA = l_nota, LOT_FECHA_MOD = sysdate, LOT_USUARIO_MOD = l_usu
     where LOT_ARE_CODIGO = l_id;
    if l_ant <> l_est then HIST(l_id, l_est); end if;
    if l_esp is not null then
      delete from MAP_LOTE_PRECIO where LPR_ARE_CODIGO = l_id;
      l_keys := l_esp.get_keys;
      for i in 1 .. l_keys.count loop
        l_cuo := to_number(l_keys(i));
        l_tot := N(l_esp, l_keys(i));
        if l_tot is not null and l_tot > 0 then
          insert into MAP_LOTE_PRECIO (LPR_ARE_CODIGO, LPR_CUOTAS, LPR_TOTAL) values (l_id, l_cuo, round(l_tot));
        end if;
      end loop;
    end if;
    commit;
    OK('Lote ' || l_mz || '-' || l_num || ' guardado');
  end;

  procedure X_ESTADO_LOTE (P json_object_t) is
    l_ant varchar2(20);
    l_id  number := N(P, 'id');
    l_est varchar2(20) := S(P, 'estado');
    l_usu varchar2(100) := USUARIO;
  begin
    if l_est not in ('DISPONIBLE','RESERVADO','VENDIDO') then ERR('Estado inválido'); end if;
    begin
      select LOT_ESTADO into l_ant from MAP_LOTE where LOT_ARE_CODIGO = l_id for update;
    exception when no_data_found then ERR('Lote inexistente');
    end;
    update MAP_LOTE set LOT_ESTADO = l_est, LOT_FECHA_MOD = sysdate, LOT_USUARIO_MOD = l_usu where LOT_ARE_CODIGO = l_id;
    if l_ant <> l_est then HIST(l_id, l_est); end if;
    commit;
    OK(case l_est when 'VENDIDO' then 'Lote marcado como vendido' when 'RESERVADO' then 'Lote reservado' else 'Lote disponible' end);
  end;

  -- Reemplaza los puntos de interes por los que manda la pantalla (buscados en OpenStreetMap).
  procedure X_GUARDAR_POIS (P json_object_t) is
    l_arr json_array_t := P.get_array('pois');
    o     json_object_t;
    l_cat varchar2(40); l_nom varchar2(400); l_lat number; l_lng number; l_dis number; l_osm varchar2(80);
    l_rad number := N(P, 'radio');
  begin
    if l_arr is null then ERR('Faltan los puntos de interés.'); end if;
    if l_arr.get_size > 200 then ERR('Demasiados puntos (máximo 200).'); end if;
    delete from MAP_LOTEO_POI;
    for i in 0 .. l_arr.get_size - 1 loop
      o := treat(l_arr.get(i) as json_object_t);
      l_cat := S(o, 'categoria'); l_nom := substr(S(o, 'nombre'), 1, 200);
      l_lat := o.get_number('lat'); l_lng := o.get_number('lng'); l_dis := round(o.get_number('dist')); l_osm := substr(S(o, 'osm'), 1, 40);
      if l_cat not in ('ESCUELA','SALUD','SUPER','COMBUSTIBLE','BANCO','RUTA','OTRO') then ERR('Categoría inválida: ' || l_cat); end if;
      if l_nom is null or l_lat not between -90 and 90 or l_lng not between -180 and 180 then ERR('Punto inválido: ' || nvl(l_nom, '?')); end if;
      insert into MAP_LOTEO_POI (POI_CATEGORIA, POI_NOMBRE, POI_LAT, POI_LNG, POI_DIST_M, POI_OSM_ID)
      values (l_cat, l_nom, l_lat, l_lng, l_dis, l_osm);
    end loop;
    update MAP_LOTEO set LOO_POI_FECHA = sysdate, LOO_POI_RADIO = nvl(l_rad, LOO_POI_RADIO) where LOO_CODIGO = 1;
    commit;
    OK(l_arr.get_size || ' puntos de interés guardados');
  end;

  procedure X_ACTIVAR_POI (P json_object_t) is
    l_id  number := N(P, 'id');
    l_act varchar2(1) := case when P.get_boolean('activo') then 'S' else 'N' end;
  begin
    update MAP_LOTEO_POI set POI_ACTIVO = l_act where POI_CODIGO = l_id;
    commit;
    OK;
  end;

  -- Atender una solicitud. Aprobar una pre-reserva pasa el lote a RESERVADO.
  procedure X_SOLICITUD (P json_object_t) is
    l_id   number := N(P, 'id');
    l_est  varchar2(20) := S(P, 'estado');
    l_tipo varchar2(20); l_are number; l_usu varchar2(100) := USUARIO; l_now date := AHORA;
    l_ant  varchar2(20);
  begin
    if l_est not in ('CONFIRMADA','ATENDIDA','DESCARTADA','PENDIENTE') then ERR('Estado inválido'); end if;
    begin
      select SOL_TIPO, SOL_ARE_CODIGO into l_tipo, l_are from MAP_LOTE_SOLICITUD where SOL_CODIGO = l_id for update;
    exception when no_data_found then ERR('Solicitud inexistente');
    end;
    update MAP_LOTE_SOLICITUD set SOL_ESTADO = l_est, SOL_ATENDIDO = case when l_est in ('ATENDIDA','DESCARTADA') then l_now end, SOL_USUARIO = l_usu
     where SOL_CODIGO = l_id;
    if l_tipo = 'RESERVA' and l_est = 'ATENDIDA' then
      select LOT_ESTADO into l_ant from MAP_LOTE where LOT_ARE_CODIGO = l_are for update;
      if l_ant = 'VENDIDO' then ERR('Ese lote ya está vendido.'); end if;
      update MAP_LOTE set LOT_ESTADO = 'RESERVADO', LOT_FECHA_MOD = sysdate, LOT_USUARIO_MOD = l_usu where LOT_ARE_CODIGO = l_are;
      if l_ant <> 'RESERVADO' then HIST(l_are, 'RESERVADO'); end if;
    end if;
    commit;
    OK(case when l_tipo = 'RESERVA' and l_est = 'ATENDIDA' then 'Reserva aprobada: el lote quedó reservado'
            when l_est = 'CONFIRMADA' then 'Visita confirmada' when l_est = 'DESCARTADA' then 'Solicitud descartada' else 'Solicitud atendida' end);
  end;

  procedure X_GUARDAR_OBRA (P json_object_t) is
    l_id  number := N(P, 'id');
    l_tit varchar2(400) := substr(S(P, 'titulo'), 1, 120);
    l_des varchar2(2000) := substr(S(P, 'descripcion'), 1, 500);
    l_est varchar2(20) := nvl(S(P, 'estado'), 'PENDIENTE');
    l_fec date;
    l_ord number := nvl(N(P, 'orden'), 10);
  begin
    if l_tit is null then ERR('Escribí el título de la obra.'); end if;
    if l_est not in ('HECHO','EN_CURSO','PENDIENTE') then ERR('Estado inválido'); end if;
    if S(P, 'fecha') is not null then l_fec := to_date(S(P, 'fecha'), 'YYYY-MM-DD'); end if;
    if l_id is null then
      insert into MAP_LOTEO_OBRA (OBR_TITULO, OBR_DESCRIPCION, OBR_ESTADO, OBR_FECHA, OBR_ORDEN) values (l_tit, l_des, l_est, l_fec, l_ord)
      returning OBR_CODIGO into l_id;
    else
      update MAP_LOTEO_OBRA set OBR_TITULO = l_tit, OBR_DESCRIPCION = l_des, OBR_ESTADO = l_est, OBR_FECHA = l_fec, OBR_ORDEN = l_ord where OBR_CODIGO = l_id;
      if sql%rowcount = 0 then ERR('Obra inexistente'); end if;
    end if;
    commit;
    EMITIR('{"ok":true,"id":' || l_id || ',"msg":"Obra guardada"}');
  end;

  procedure X_BORRAR_OBRA (P json_object_t) is
    l_id number := N(P, 'id');
  begin
    delete from MAP_LOTEO_OBRA where OBR_CODIGO = l_id;
    commit;
    OK('Obra eliminada');
  end;

  -- Foto de obra en un solo pedido: base64 en trozos de f01 (la imagen ya viene achicada del navegador).
  procedure X_OBRA_FOTO (P json_object_t) is
    l_id   number := N(P, 'id');
    l_mime varchar2(60) := lower(S(P, 'mime'));
    l_blob blob;
    l_raw  raw(32767);
  begin
    if l_mime not in ('image/jpeg','image/png','image/webp') then ERR('Solo fotos JPG, PNG o WEBP.'); end if;
    update MAP_LOTEO_OBRA set OBR_FOTO = empty_blob(), OBR_FOTO_MIME = l_mime where OBR_CODIGO = l_id returning OBR_FOTO into l_blob;
    if sql%rowcount = 0 then ERR('Obra inexistente'); end if;
    for i in 1 .. apex_application.g_f01.count loop
      if apex_application.g_f01(i) is not null then
        l_raw := utl_encode.base64_decode(utl_raw.cast_to_raw(apex_application.g_f01(i)));
        dbms_lob.writeappend(l_blob, utl_raw.length(l_raw), l_raw);
      end if;
    end loop;
    if dbms_lob.getlength(l_blob) > 1500000 then ERR('La foto es muy pesada (máximo 1,5 MB).'); end if;
    commit;
    OK('Foto guardada');
  end;

  procedure X_OG_GUARDAR (P json_object_t) is
    l_clave number := N(P, 'clave');
    l_blob  blob;
    l_raw   raw(32767);
  begin
    if l_clave is null or l_clave < 0 then ERR('Clave inválida'); end if;
    delete from MAP_LOTE_OG where OG_CLAVE = l_clave;
    insert into MAP_LOTE_OG (OG_CLAVE, OG_IMG, OG_MIME, OG_FECHA) values (l_clave, empty_blob(), 'image/jpeg', sysdate) returning OG_IMG into l_blob;
    for i in 1 .. apex_application.g_f01.count loop
      if apex_application.g_f01(i) is not null then
        l_raw := utl_encode.base64_decode(utl_raw.cast_to_raw(apex_application.g_f01(i)));
        dbms_lob.writeappend(l_blob, utl_raw.length(l_raw), l_raw);
      end if;
    end loop;
    if dbms_lob.getlength(l_blob) > 900000 then ERR('Imagen demasiado pesada'); end if;
    commit;
    OK;
  end;

  procedure AJAX is
    l_p json_object_t;
  begin
    if v('APP_USER') is null or v('APP_USER') = 'nobody' then ERR('Tu sesión no es válida. Volvé a entrar.'); end if;
    l_p := json_object_t.parse(nvl(apex_application.g_x02, '{}'));
    case apex_application.g_x01
      when 'RESUMEN'        then X_RESUMEN;
      when 'GUARDAR_LOTEO'  then X_GUARDAR_LOTEO(l_p);
      when 'GUARDAR_PLANES' then X_GUARDAR_PLANES(l_p);
      when 'GUARDAR_LOTE'   then X_GUARDAR_LOTE(l_p);
      when 'ESTADO_LOTE'    then X_ESTADO_LOTE(l_p);
      when 'GUARDAR_POIS'   then X_GUARDAR_POIS(l_p);
      when 'ACTIVAR_POI'    then X_ACTIVAR_POI(l_p);
      when 'SOLICITUD'      then X_SOLICITUD(l_p);
      when 'INFO'           then P_INFO;          -- la gestion arma las vistas previas con los mismos datos del plano
      when 'OG_GUARDAR'     then X_OG_GUARDAR(l_p);
      when 'GUARDAR_OBRA'   then X_GUARDAR_OBRA(l_p);
      when 'BORRAR_OBRA'    then X_BORRAR_OBRA(l_p);
      when 'OBRA_FOTO'      then X_OBRA_FOTO(l_p);
      else ERR('Acción desconocida');
    end case;
  exception when others then
    MANEJAR_ERROR;
  end;

end LOT000;
/
show errors package body LOT000
