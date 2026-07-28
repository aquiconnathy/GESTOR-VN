// Servicio para obtener tasa BCV desde API gratuita
export async function obtenerTasaBCV() {
    try {
        const res = await fetch('https://rates.dolarvzla.com/bcv/current.json', {
            cache: 'no-store'
        });
        const data = await res.json();
        return {
            tasa_usd: data.current.usd,
            tasa_eur: data.current.eur,
            fecha: data.current.date
        };
    } catch (error) {
        console.error('Error obteniendo tasa BCV:', error);
        throw error;
    }
}

export async function sincronizarTasaBCV(supabase) {
    const { tasa_usd, tasa_eur, fecha } = await obtenerTasaBCV();
    
    await supabase
        .from('tasas_bcv')
        .upsert({ fecha, tasa_usd, tasa_eur, fuente: 'API', activa: true }, 
                { onConflict: 'fecha' });
    
    // Desactivar tasas anteriores
    await supabase
        .from('tasas_bcv')
        .update({ activa: false })
        .neq('fecha', fecha);
    
    return { tasa_usd, fecha };
}
