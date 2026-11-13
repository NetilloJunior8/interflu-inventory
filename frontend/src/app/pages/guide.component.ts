import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-guide',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="guide-container">
      <!-- Header Banner -->
      <div class="guide-hero">
        <div class="hero-left">
          <span class="guide-kicker">MANUAL DE OPERACIÓN TÉCNICA</span>
          <h1 class="guide-title">Protocolo de Inventario Físico Industrial</h1>
          <p class="guide-desc">
            Procedimiento estándar para ingenieros, supervisores y técnicos de almacén en <strong>Interflu (Internacional de Fluidos, S.A. de C.V.)</strong>.
            Diseñado para captura a máxima velocidad, cero errores de digitación y generación directa de Partidas de Inventario (PI) para Aspel SAE.
          </p>
        </div>
        <div class="hero-right">
          <div class="quick-links-box">
            <span class="box-title">Accesos Rápidos</span>
            <a routerLink="/capture" class="hero-link">Ir a Cédula de Conteo &rarr;</a>
            <a routerLink="/croquis" class="hero-link">Ir a Croquis Planta 1 y 2 &rarr;</a>
            <a routerLink="/export" class="hero-link">Ir a Exportar SAE &rarr;</a>
          </div>
        </div>
      </div>

      <!-- 5-Step Operational Flow -->
      <div class="protocol-grid">
        <!-- Step 1 -->
        <div class="protocol-card">
          <div class="card-step-header">
            <span class="step-badge">Fase 1</span>
            <h2 class="step-title">Apertura y Selección de Cédula</h2>
          </div>
          <div class="card-body">
            <p>El proceso inicia seleccionando el <strong>Folio de Inventario</strong> y el <strong>Anaquel Físico</strong> a contabilizar:</p>
            <ul class="guide-checklist">
              <li>Cada anaquel físico representa una cédula de captura independiente.</li>
              <li>Si se inicia un nuevo proceso general, se genera un folio con la nomenclatura institucional <code>INV-AAAA-NNN</code>.</li>
              <li>El operador puede verificar en el <strong>Croquis</strong> el semáforo del anaquel: <em>Gris</em> (Pendiente), <em>Azul</em> (En Conteo) o <em>Verde</em> (Contabilizado).</li>
            </ul>
          </div>
        </div>

        <!-- Step 2 -->
        <div class="protocol-card highlight-card">
          <div class="card-step-header">
            <span class="step-badge badge-primary">Fase 2</span>
            <h2 class="step-title">Captura Rápida en Cédula (Código + Piezas)</h2>
          </div>
          <div class="card-body">
            <p>La cédula está optimizada para ingreso con teclado numérico sin distracciones (se omitió la columna de descripción para velocidad):</p>
            <div class="feature-pills-row">
              <div class="feature-item">
                <strong>Flujo Enter-Enter:</strong> Teclea el código &rarr; pulsa <code>Enter</code> (salta a piezas) &rarr; teclea cantidad &rarr; pulsa <code>Enter</code> (agrega automáticamente el siguiente renglón).
              </div>
              <div class="feature-item">
                <strong>Insertar Fila en Media Celda (+ Fila):</strong> Si al avanzar en el anaquel encuentras una pieza física omitida entre dos renglones ya anotados, pulsa <code>+ Fila</code> para abrir un espacio intermedio sin mover nada.
              </div>
              <div class="feature-item">
                <strong>Atajos de Fracciones y Cédulas:</strong> Pulsa los chips superiores (<code>1/4</code>, <code>3/8</code>, <code>1/2</code>, <code>3/4</code>, <code>1</code>, <code>1 1/2</code>, <code>3 1/2</code>, <code>2/4x1/4</code>) para insertarlas al código con un solo toque.
              </div>
              <div class="feature-item">
                <strong>Pegado Directo de Excel (Ctrl+V):</strong> Copia 2 columnas desde cualquier Excel (Código y Piezas) y pégalas directamente en la tabla.
              </div>
            </div>
          </div>
        </div>

        <!-- Step 3 -->
        <div class="protocol-card">
          <div class="card-step-header">
            <span class="step-badge">Fase 3</span>
            <h2 class="step-title">Control de Calidad y Detección de Duplicados</h2>
          </div>
          <div class="card-body">
            <p>Prevención de errores humanos antes del guardado:</p>
            <ul class="guide-checklist">
              <li><strong>Alerta Ámbar en Tiempo Real:</strong> Si un código se repite en el mismo anaquel, la fila se enmarca en ámbar señalando el renglón original donde ya fue anotado.</li>
              <li><strong>Consolidación con un Clic:</strong> El botón <em>"Sumar y Consolidar Repetidos"</em> agrupa las piezas duplicadas en una sola partida y limpia los renglones redundantes.</li>
              <li><strong>Memoria Histórica del Sistema:</strong> Una vez guardados y confirmados, el sistema memoriza las claves verificadas para avisar si alguien intenta re-contarlas por error.</li>
            </ul>
          </div>
        </div>

        <!-- Step 4 -->
        <div class="protocol-card">
          <div class="card-step-header">
            <span class="step-badge">Fase 4</span>
            <h2 class="step-title">Croquis y Acomodo Manual de Anaqueles</h2>
          </div>
          <div class="card-body">
            <p>Representación visual del almacén en Planta 1 y Planta 2:</p>
            <ul class="guide-checklist">
              <li><strong>Ubicación Genérica Inicial:</strong> Se pueden crear anaqueles sin coordenadas fijas y colocarlos posteriormente sobre el plano.</li>
              <li><strong>Acomodo Visual:</strong> Activa el <em>Modo Acomodo</em> en el Croquis para arrastrar o hacer clic y reubicar las coordenadas exactas de cada anaquel en la nave.</li>
              <li><strong>Carga de Plano de Fondo:</strong> Permite importar la imagen arquitectónica o fotografía aérea de Planta 1 o Planta 2 como plantilla de fondo.</li>
            </ul>
          </div>
        </div>

        <!-- Step 5 -->
        <div class="protocol-card highlight-card">
          <div class="card-step-header">
            <span class="step-badge badge-success">Fase 5</span>
            <h2 class="step-title">Exportación para Aspel SAE (Por Anaquel y Consolidado)</h2>
          </div>
          <div class="card-body">
            <p>Generación de archivos limpios y validados listos para el importador de Aspel SAE:</p>
            <div class="feature-pills-row">
              <div class="feature-item">
                <strong>Exportación por Anaquel Individual:</strong> Genera el archivo exclusivo del anaquel seleccionado (ej. <code>SAE_P1-VAL-01.csv</code>) para auditorías sectorizadas o cierres por zona.
              </div>
              <div class="feature-item">
                <strong>Consolidado Global (Para PIs de SAE):</strong> Genera un único archivo maestro con la sumatoria de todas las refacciones contadas en todos los anaqueles. Con este archivo se alimentan las Partidas de Inventario (PIs) en Aspel SAE.
              </div>
              <div class="feature-item">
                <strong>Formato Exacto SAE:</strong> Estructura estricta <code>CVE_ART,ALMACEN,CANTIDAD</code> con codificación UTF-8 con BOM para evitar problemas con acentos o caracteres industriales.
              </div>
              <div class="feature-item">
                <strong>Cierre y Reapertura Segura:</strong> Al concluir la carga se marca como <em>Éxito SAE</em>, protegiendo la cédula. Si posteriormente se detecta algún faltante físico, cualquier usuario autorizado puede pulsar <em>Reabrir Folio</em> para desbloquear la lista completa y agregar las piezas.
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- FAQ / Edge Cases -->
      <div class="guide-faq-card">
        <h3 class="faq-main-title">Casos Especiales y Preguntas Frecuentes</h3>
        <div class="faq-grid">
          <div class="faq-item">
            <h4>¿Qué pasa si capturo un código que no existía en el catálogo previo?</h4>
            <p>El sistema lo acepta automáticamente, le asigna estatus <em>Nuevo</em> y lo incorpora al catálogo y memoria del sistema. No se interrumpe la captura física.</p>
          </div>
          <div class="faq-item">
            <h4>¿Por qué no se muestra la existencia teórica de SAE ni diferencias durante la captura?</h4>
            <p>Por norma de control interno e inventario físico ciego: el capturista debe registrar las piezas reales que existen físicamente en bodega sin sesgos de lo que dice el sistema. Aspel SAE se actualizará con lo contado una vez importado el archivo.</p>
          </div>
          <div class="faq-item">
            <h4>¿Cómo se imprime una etiqueta QR de una refacción contada?</h4>
            <p>En el módulo de <strong>Etiquetas QR</strong> se puede generar la etiqueta individual con su código QR en PNG o pulsar <em>Imprimir Lote</em> para generar la hoja técnica lista para impresora térmica o carta.</p>
          </div>
          <div class="faq-item">
            <h4>¿Dónde queda registrado quién realizó cada conteo o modificación?</h4>
            <p>En el módulo de <strong>Movimientos</strong> queda una bitácora inmutable con el usuario (Osiris o Alexis), la fecha, hora exacta, número de piezas, folio y acción ejecutada.</p>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .guide-container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .guide-hero {
      background: linear-gradient(135deg, #0a2472 0%, #1e3a8a 100%);
      border-radius: var(--radius-lg, 12px);
      padding: 2.25rem;
      color: #ffffff;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 2rem;
      flex-wrap: wrap;
      box-shadow: 0 4px 20px rgba(10, 36, 114, 0.15);
    }

    .hero-left {
      max-width: 820px;
    }

    .guide-kicker {
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      color: #93c5fd;
      text-transform: uppercase;
      display: block;
      margin-bottom: 0.5rem;
    }

    .guide-title {
      font-size: 1.85rem;
      font-weight: 800;
      margin: 0 0 0.75rem 0;
      letter-spacing: -0.01em;
    }

    .guide-desc {
      font-size: 0.95rem;
      line-height: 1.6;
      color: #e2e8f0;
      margin: 0;
    }

    .quick-links-box {
      background: rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: var(--radius-md, 8px);
      padding: 1.25rem 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
      min-width: 260px;
    }

    .box-title {
      font-size: 0.75rem;
      font-weight: 700;
      color: #cbd5e1;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.25rem;
    }

    .hero-link {
      color: #ffffff;
      text-decoration: none;
      font-weight: 600;
      font-size: 0.88rem;
      padding: 0.35rem 0.5rem;
      border-radius: 4px;
      transition: all 0.15s ease;
      background: rgba(255, 255, 255, 0.08);
    }
    .hero-link:hover {
      background: rgba(255, 255, 255, 0.2);
      transform: translateX(4px);
    }

    /* Protocol Cards */
    .protocol-grid {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }

    .protocol-card {
      background: #ffffff;
      border: 1px solid var(--border-color, #e2e8f0);
      border-radius: var(--radius-lg, 12px);
      padding: 1.5rem;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
    }
    .protocol-card.highlight-card {
      border-left: 5px solid #1d4ed8;
    }

    .card-step-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1rem;
    }

    .step-badge {
      font-size: 0.75rem;
      font-weight: 800;
      padding: 0.25rem 0.6rem;
      border-radius: 9999px;
      background: #f1f5f9;
      color: #475569;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .badge-primary {
      background: #eff6ff;
      color: #1d4ed8;
      border: 1px solid #bfdbfe;
    }
    .badge-success {
      background: #ecfdf5;
      color: #047857;
      border: 1px solid #a7f3d0;
    }

    .step-title {
      font-size: 1.2rem;
      font-weight: 700;
      color: #0f172a;
      margin: 0;
    }

    .guide-checklist {
      margin: 0;
      padding-left: 1.25rem;
      color: #334155;
      font-size: 0.9rem;
      line-height: 1.7;
    }

    .feature-pills-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1rem;
      margin-top: 0.75rem;
    }

    .feature-item {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 0.85rem 1rem;
      font-size: 0.85rem;
      color: #334155;
      line-height: 1.5;
    }
    .feature-item strong {
      display: block;
      color: #0f172a;
      margin-bottom: 0.25rem;
    }

    /* FAQ Card */
    .guide-faq-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: var(--radius-lg, 12px);
      padding: 1.75rem;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
    }

    .faq-main-title {
      font-size: 1.15rem;
      font-weight: 700;
      color: #0f172a;
      margin: 0 0 1.25rem 0;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 0.75rem;
    }

    .faq-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 1.25rem;
    }

    .faq-item h4 {
      font-size: 0.92rem;
      font-weight: 700;
      color: #0a2472;
      margin: 0 0 0.35rem 0;
    }

    .faq-item p {
      font-size: 0.85rem;
      color: #475569;
      line-height: 1.55;
      margin: 0;
    }
  `]
})
export class GuideComponent {}
