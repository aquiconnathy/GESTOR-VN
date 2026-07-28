import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

function formatInputNumber(val) {
    let clean = String(val).replace(/[^0-9.,]/g, '');
    const parts = clean.split(',');
    let integer = parts[0].replace(/\./g, '');
    let decimal = parts[1] ? parts[1].slice(0, 2) : '';
    integer = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return decimal ? `${integer},${decimal}` : integer;
}

function parseFormattedNumber(val) {
    return parseFloat(String(val).replace(/\./g, '').replace(',', '.')) || 0;
}

export function useFormularioVenta() {
    const [tasaBCV, setTasaBCV] = useState(0);
    const [formasPago, setFormasPago] = useState([]);
    const [loading, setLoading] = useState(true);
    
    const [venta, setVenta] = useState({
        monto_usd: '',
        monto_ves: '',
        moneda_base: 'USD',
        forma_pago_id: '',
        referencia: '',
        tasa_bcv_aplicada: 0
    });

    useEffect(() => {
        async function cargarDatos() {
            const { data: tasaData } = await supabase
                .from('tasas_bcv')
                .select('tasa_usd')
                .eq('activa', true)
                .order('fecha', { ascending: false })
                .limit(1)
                .single();
            
            const tasa = tasaData?.tasa_usd || 0;
            setTasaBCV(tasa);
            setVenta(prev => ({ ...prev, tasa_bcv_aplicada: tasa }));
            
            const { data: fpData } = await supabase
                .from('formas_pago')
                .select('*')
                .eq('activo', true)
                .order('orden');
            
            setFormasPago(fpData || []);
            setLoading(false);
        }
        cargarDatos();
    }, []);

    const handleChange = (campo, valor) => {
        setVenta(prev => {
            const nuevo = { ...prev, [campo]: valor };
            
            if (campo === 'moneda_base') {
                // Limpiar montos al cambiar moneda base
                nuevo.monto_usd = '';
                nuevo.monto_ves = '';
            }
            
            if (campo === 'monto_usd' && prev.moneda_base === 'USD') {
                const usd = parseFormattedNumber(valor);
                nuevo.monto_ves = usd > 0 && prev.tasa_bcv_aplicada > 0
                    ? formatInputNumber((usd * prev.tasa_bcv_aplicada).toFixed(2).replace('.', ','))
                    : '';
            }
            
            if (campo === 'monto_ves' && prev.moneda_base === 'VES') {
                const ves = parseFormattedNumber(valor);
                nuevo.monto_usd = ves > 0 && prev.tasa_bcv_aplicada > 0
                    ? formatInputNumber((ves / prev.tasa_bcv_aplicada).toFixed(2).replace('.', ','))
                    : '';
            }
            
            if (campo === 'tasa_bcv_aplicada') {
                // Recalcular con nueva tasa
                const tasa = parseFloat(valor) || 0;
                if (prev.moneda_base === 'USD' && prev.monto_usd) {
                    const usd = parseFormattedNumber(prev.monto_usd);
                    nuevo.monto_ves = usd > 0 && tasa > 0
                        ? formatInputNumber((usd * tasa).toFixed(2).replace('.', ','))
                        : '';
                } else if (prev.moneda_base === 'VES' && prev.monto_ves) {
                    const ves = parseFormattedNumber(prev.monto_ves);
                    nuevo.monto_usd = ves > 0 && tasa > 0
                        ? formatInputNumber((ves / tasa).toFixed(2).replace('.', ','))
                        : '';
                }
            }
            
            return nuevo;
        });
    };

    const guardarVenta = async () => {
        const { data, error } = await supabase
            .from('ventas')
            .insert({
                monto_usd: parseFormattedNumber(venta.monto_usd) || null,
                monto_ves: parseFormattedNumber(venta.monto_ves) || null,
                moneda_base: venta.moneda_base,
                forma_pago_id: venta.forma_pago_id,
                referencia: venta.referencia,
                tasa_bcv_aplicada: parseFloat(venta.tasa_bcv_aplicada) || 0,
            })
            .select();
        
        return { data, error };
    };

    return { venta, tasaBCV, formasPago, loading, handleChange, guardarVenta, formatInputNumber };
}
