export default function FormularioVenta() {
    const { venta, tasaBCV, formasPago, loading, handleChange, guardarVenta, formatInputNumber } = useFormularioVenta();
    
    if (loading) return <p>Cargando...</p>;
    
    const formaPagoSel = formasPago.find(fp => fp.id === venta.forma_pago_id);
    const esPayPal = formaPagoSel?.nombre?.toLowerCase().includes('paypal');
    
    const validarRef = () => {
        const ref = venta.referencia;
        if (!ref || ref.length < 6) return false;
        if (esPayPal) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ref);
        return true;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validarRef()) {
            alert('Referencia inválida');
            return;
        }
        const { data, error } = await guardarVenta();
        if (error) alert('Error: ' + error.message);
        else {
            alert(`Venta guardada!\nUSD: ${venta.monto_usd}\nVES: ${venta.monto_ves}\nTasa: ${venta.tasa_bcv_aplicada}`);
            // Resetear formulario si quieres
        }
    };

    return (
        <form onSubmit={handleSubmit}>
            <div style={{background:'#1a1a2e', padding:'10px', borderRadius:'8px', marginBottom:'15px'}}>
                <strong>Tasa BCV Vigente:</strong> Bs. {tasaBCV} / USD
                {tasaBCV === 0 && <span style={{color:'red'}}> ⚠️ Sin tasa configurada</span>}
            </div>

            <div>
                <label>Moneda Base *</label>
                <select value={venta.moneda_base} onChange={e => handleChange('moneda_base', e.target.value)}>
                    <option value="USD">Dólares (USD)</option>
                    <option value="VES">Bolívares (VES)</option>
                </select>
            </div>

            <div>
                <label>Monto en {venta.moneda_base} *</label>
                <input
                    type="text"
                    inputMode="decimal"
                    value={venta.moneda_base === 'USD' ? venta.monto_usd : venta.monto_ves}
                    onChange={e => handleChange(
                        venta.moneda_base === 'USD' ? 'monto_usd' : 'monto_ves',
                        formatInputNumber(e.target.value)
                    )}
                    placeholder={venta.moneda_base === 'USD' ? '1.234,56' : '123.456,78'}
                    required
                />
            </div>

            <div>
                <label>Monto en {venta.moneda_base === 'USD' ? 'Bolívares (VES)' : 'Dólares (USD)'}
                    <small> (calculado automáticamente)</small>
                </label>
                <input
                    type="text"
                    inputMode="decimal"
                    value={venta.moneda_base === 'USD' ? venta.monto_ves : venta.monto_usd}
                    onChange={e => handleChange(
                        venta.moneda_base === 'USD' ? 'monto_ves' : 'monto_usd',
                        formatInputNumber(e.target.value)
                    )}
                    placeholder="Se calcula automáticamente"
                />
            </div>

            <div>
                <label>Tasa BCV Aplicada</label>
                <input
                    type="number"
                    step="0.0001"
                    value={venta.tasa_bcv_aplicada}
                    onChange={e => handleChange('tasa_bcv_aplicada', e.target.value)}
                />
                <small>Ajustable manualmente si es necesario</small>
            </div>

            <div>
                <label>Forma de Pago *</label>
                <select value={venta.forma_pago_id} onChange={e => handleChange('forma_pago_id', e.target.value)} required>
                    <option value="">Seleccione...</option>
                    {formasPago.map(fp => (
                        <option key={fp.id} value={fp.id}>{fp.nombre} ({fp.tipo_moneda})</option>
                    ))}
                </select>
            </div>

            <div>
                <label>{esPayPal ? 'Correo PayPal *' : 'Referencia / Nº Transacción *'}</label>
                <input
                    type={esPayPal ? 'email' : 'text'}
                    value={venta.referencia}
                    onChange={e => handleChange('referencia', e.target.value)}
                    minLength={6}
                    placeholder={esPayPal ? 'cliente@paypal.com' : 'Mínimo 6 caracteres'}
                    required
                />
            </div>

            <button type="submit" disabled={tasaBCV === 0}>Guardar Venta</button>
        </form>
    );
}
