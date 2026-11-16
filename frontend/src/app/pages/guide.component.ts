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
          <div class="kicker-row">
            <span class="guide-kicker">MANUAL DE OPERACIÓN TÉCNICA</span>
            <span class="hero-chip">170 ANAQUELES OFICIALES (87 PB + 83 PA)</span>
          </div>
          <h1 class="guide-title">Protocolo de Inventario Físico Industrial</h1>
          <p class="guide-desc">
            Procedimiento operativo estándar para ingenieros, supervisores y técnicos de almacén en <strong>Interflu (Internacional de Fluidos, S.A. de C.V.)</strong>.
            Diseñado para captura a máxima velocidad, reversibilidad ante errores de digitación, trazabilidad de auditoría y generación directa de Partidas de Inventario (PI) para Aspel SAE.
          </p>
        </div>
        <div class="hero-right">
          <div class="quick-links-box">
            <span class="box-title">Accesos Directos</span>
            <a routerLink="/capture" class="hero-link">Cédula de Conteo &rarr;</a>
            <a routerLink="/croquis" class="hero-link">Croquis Planta Baja y Alta &rarr;</a>
            <a routerLink="/qr-labels" class="hero-link">Centro de Etiquetas QR &rarr;</a>
            <a routerLink="/export" class="hero-link">Exportación Aspel SAE &rarr;</a>
          </div>
        </div>
      </div>

      <!-- Quick Metrics Overview -->
      <div class="summary-metrics-strip">
        <div class="sm-card">
          <span class="sm-lbl">Total Anaqueles Físicos</span>
          <span class="sm-val mono">170</span>
          <span class="sm-sub">87 Planta Baja | 83 Planta Alta</span>
        </div>
        <div class="sm-card">
          <span class="sm-lbl">Semáforo del Croquis</span>
          <span class="sm-val text-success">Verde = Completo</span>
          <span class="sm-sub text-muted">Neutro / Familia = Pendiente (Sin Rojo)</span>
        </div>
        <div class="sm-card">
          <span class="sm-lbl">Protección de Datos</span>
          <span class="sm-val text-primary-brand">Deshacer (Ctrl+Z)</span>
          <span class="sm-sub">Reversión de Cierre y de Cédula</span>
        </div>
        <div class="sm-card">
          <span class="sm-lbl">Etiquetado QR</span>
          <span class="sm-val text-accent">Generación Instantánea</span>
          <span class="sm-sub">Individual PNG, Anaquel y Lote ZIP</span>
        </div>
      </div>

      <!-- 6-Phase Operational Protocol Grid -->
      <div class="protocol-grid">
        <!-- Fase 1 -->
        <div class="protocol-card">
          <div class="card-step-header">
            <span class="step-badge">Fase 1</span>
            <h2 class="step-title">Apertura de Inventario y Selección de Cédula</h2>
          </div>
          <div class="card-body">
            <p>El proceso inicia seleccionando o creando el <strong>Folio de Inventario</strong> activo y abriendo el anaquel a contabilizar:</p>
            <ul class="guide-checklist">
              <li><strong>Estructura Oficial de 170 Anaqueles:</strong> El almacén cuenta exactamente con <strong>170 anaqueles</strong> físicos (87 en Planta Baja y 83 en Planta Alta). El área histórica de documentos ha sido dada de baja del conteo y ya no forma parte del inventario operativo.</li>
              <li><strong>Folio Institucional:</strong> Todo conteo se asocia a una sesión con nomenclatura <code>INV-AAAA-NNN</code>.</li>
              <li><strong>Semáforo Oficial en Croquis:</strong> El color <strong>Verde Esmeralda</strong> está reservado de manera estricta y exclusiva para anaqueles <strong>Completados</strong> (100% contados). Los anaqueles <strong>Pendientes</strong> se muestran en color neutro / con el tono cromático de su familia de producto. <em>El color rojo nunca se utiliza para anaqueles pendientes</em>, evitando confusiones o falsas alarmas visuales en planta.</li>
              <li><strong>Reversión de Cierre Accidental:</strong> Si una sesión se cierra por descuido o error, en el panel principal se dispone del botón <strong>"Deshacer Cierre Ahora"</strong>, el cual restaura inmediatamente el inventario al estado activo <code>EN_CONTEO</code> sin borrar renglones y registrando la auditoría del supervisor.</li>
            </ul>
          </div>
        </div>

        <!-- Fase 2 -->
        <div class="protocol-card highlight-card">
          <div class="card-step-header">
            <span class="step-badge badge-primary">Fase 2</span>
            <h2 class="step-title">Captura Rápida en Cédula y Sistema Deshacer (Ctrl+Z)</h2>
          </div>
          <div class="card-body">
            <p>La cédula está optimizada para digitación continua con teclado numérico y recuperación inmediata ante equivocaciones:</p>
            <div class="feature-pills-row">
              <div class="feature-item">
                <strong>Flujo Enter-Enter Continuo:</strong> Teclea el código de la pieza &rarr; pulsa <code>Enter</code> (el cursor salta al campo de piezas) &rarr; digita la cantidad &rarr; pulsa <code>Enter</code> (crea y enfoca automáticamente el siguiente renglón).
              </div>
              <div class="feature-item">
                <strong>Sistema Deshacer (Undo / Ctrl+Z):</strong> Cualquier edición de celda, borrado de fila o pegado masivo puede deshacerse al instante pulsando <code>Ctrl + Z</code> o haciendo clic en el botón <em>"Deshacer"</em> de la barra de herramientas. El sistema mantiene un historial de reversión por anaquel.
              </div>
              <div class="feature-item">
                <strong>Inserción de Renglón Intermedio (+ Fila):</strong> Si al revisar físicamente el anaquel se descubre una refacción omitida entre dos renglones ya capturados, pulsa <code>+ Fila</code> en esa posición para intercalar el nuevo material sin desordenar la secuencia previa.
              </div>
              <div class="feature-item">
                <strong>Chips de Medidas y Fracciones Rápidas:</strong> Pulsa los chips superiores (<code>1/4</code>, <code>3/8</code>, <code>1/2</code>, <code>3/4</code>, <code>1</code>, <code>1 1/2</code>, <code>3 1/2</code>, <code>2/4x1/4</code>) para insertarlas directamente en el código de refacción sin alternar entre caracteres especiales del teclado.
              </div>
              <div class="feature-item">
                <strong>Pegado Directo desde Excel (Ctrl+V):</strong> Copia 2 columnas desde cualquier hoja de cálculo externa (Código y Cantidad) y pégalas directamente en la tabla para importar lotes instantáneamente.
              </div>
              <div class="feature-item">
                <strong>Filas Limpias al Iniciar:</strong> Los anaqueles vacíos inician con una sola fila limpia de captura, eliminando el exceso de renglones vacíos que antes saturaban la pantalla.
              </div>
            </div>
          </div>
        </div>

        <!-- Fase 3 -->
        <div class="protocol-card">
          <div class="card-step-header">
            <span class="step-badge">Fase 3</span>
            <h2 class="step-title">Control de Calidad, Detección de Repetidos y Limpieza Granular</h2>
          </div>
          <div class="card-body">
            <p>Mecanismos automáticos de validación física antes del cierre de anaquel:</p>
            <ul class="guide-checklist">
              <li><strong>Alerta Ámbar de Códigos Duplicados:</strong> Si se ingresa una misma clave de refacción dos o más veces en el mismo anaquel, la fila se enmarca en color ámbar de advertencia, indicando en qué renglón previo ya había sido contada.</li>
              <li><strong>Consolidación en un Clic:</strong> El botón <em>"Sumar y Consolidar Repetidos"</em> totaliza las unidades de las partidas idénticas en un único renglón consolidado y purga las filas redundantes.</li>
              <li><strong>Limpieza Granular por Anaquel Individual:</strong> Si un operario contó por equivocación el anaquel equivocado o requiere reiniciar la captura de un anaquel específico, puede pulsar <em>"Limpiar Datos de Este Anaquel"</em>. Esta acción restablece el anaquel a estado Pendiente con 0 piezas sin alterar ni afectar ningún otro anaquel del inventario.</li>
            </ul>
          </div>
        </div>

        <!-- Fase 4 -->
        <div class="protocol-card">
          <div class="card-step-header">
            <span class="step-badge">Fase 4</span>
            <h2 class="step-title">Croquis Digital y Avance por Familias Pinned a la Derecha</h2>
          </div>
          <div class="card-body">
            <p>Supervisión en tiempo real de la distribución física del almacén:</p>
            <ul class="guide-checklist">
              <li><strong>Panel Lateral Fijo a la Derecha:</strong> En pantallas de computadora y laptop, el panel de <em>"Avance por Familias"</em> se ubica de forma lateral a la derecha, manteniendo visible el progreso general sin invadir el plano ni desplazarse hacia abajo. En dispositivos móviles pequeños se adapta automáticamente.</li>
              <li><strong>Diferenciación Cromática de Familias:</strong> Cada categoría posee un color industrial claramente distinguible: <em>Acero</em> (Azul Zafiro), <em>YPC</em> (Violeta), <em>Dixon</em> (Magenta), <em>Kuriyama</em> (Naranja), <em>PVC</em> (Cian), <em>Resortes</em> (Azul Marino), etc. Solo cuando una familia completa el 100% de sus anaqueles, la barra progresa a Verde.</li>
              <li><strong>Zoom Predeterminado a Escala Óptima:</strong> La vista de croquis se escala por defecto al <strong>68%</strong> con presets directos (55%, 68%, 85%, 100% y "Ajustar Pantalla") para encajar la nave completa en pantallas de cualquier resolución.</li>
              <li><strong>Modo Acomodo CAD:</strong> Permite desplazar anaqueles sobre el plano o editar sus coordenadas numéricas precisas (X, Y, W, H) y rotación con guardado en base de datos.</li>
            </ul>
          </div>
        </div>

        <!-- Fase 5 -->
        <div class="protocol-card highlight-card">
          <div class="card-step-header">
            <span class="step-badge badge-accent">Fase 5</span>
            <h2 class="step-title">Centro de Etiquetas y Códigos QR de Refacciones</h2>
          </div>
          <div class="card-body">
            <p>Generación y descarga de códigos QR para refacciones y rótulos físicos de anaqueles:</p>
            <div class="feature-pills-row">
              <div class="feature-item">
                <strong>Generación Instantánea en Tiempo Real:</strong> El renderizado de códigos QR se procesa directamente en el cliente con actualización inmediata en pantalla, eliminando tiempos muertos de espera o iconos de carga bloqueados.
              </div>
              <div class="feature-item">
                <strong>Descarga Individual con Clave Exacta (PNG):</strong> Al pulsar el icono de descarga de un material o anaquel, se descarga el archivo PNG nombrado con su código exacto (ej. <code>PB-ACE-05.png</code> o <code>1-4-ACERO.png</code>), listo para impresión y rotulación física directa.
              </div>
              <div class="feature-item">
                <strong>Descarga de Códigos QR por Anaquel (.ZIP):</strong> Genera un archivo comprimido que reúne todos los códigos QR de los materiales contabilizados dentro de un anaquel específico.
              </div>
              <div class="feature-item">
                <strong>Extracción por Lote Completo (.ZIP):</strong> Descarga todo el universo de refacciones del almacén ordenado automáticamente en subcarpetas clasificadas por cada uno de los 170 anaqueles.
              </div>
            </div>
          </div>
        </div>

        <!-- Fase 6 -->
        <div class="protocol-card">
          <div class="card-step-header">
            <span class="step-badge badge-success">Fase 6</span>
            <h2 class="step-title">Exportación a Aspel SAE y Registro de Auditoría</h2>
          </div>
          <div class="card-body">
            <p>Consolidación final de datos con compatibilidad estricta para el sistema administrativo:</p>
            <ul class="guide-checklist">
              <li><strong>Estructura Estricta Aspel SAE:</strong> Formato nativo <code>CVE_ART,ALMACEN,CANTIDAD</code> con codificación UTF-8 con BOM para evitar fallas con acentos o guiones industriales al importar Partidas de Inventario (PIs).</li>
              <li><strong>Consolidado Maestro Global:</strong> Sumatoria exacta de todas las existencias contadas a nivel bodega sin partidas duplicadas ni conteos inflados.</li>
              <li><strong>Exportación por Anaquel:</strong> Archivo individual por anaquel (ej. <code>SAE_PB-ACE-05.csv</code>) para auditorías sectorizadas o cierres paulatinos.</li>
              <li><strong>Bitácora de Movimientos Inmutable:</strong> Todo cambio, creación de anaquel, consolidación, captura y reapertura queda registrado con fecha, hora, usuario operador y motivo justificado.</li>
            </ul>
          </div>
        </div>
      </div>

      <!-- FAQ Section -->
      <div class="guide-faq-card">
        <h3 class="faq-main-title">Preguntas Frecuentes y Casos Prácticos</h3>
        <div class="faq-grid">
          <div class="faq-item">
            <h4>¿Por qué no se utiliza el color rojo para los anaqueles pendientes en el croquis?</h4>
            <p>Porque en un entorno de almacén industrial el color rojo representa errores o fallas críticas. Un anaquel que aún no se ha contado se encuentra en estado normal de espera (neutro / familia), mientras que el verde se reserva exclusivamente para los anaqueles terminados.</p>
          </div>
          <div class="faq-item">
            <h4>¿Qué ocurre si un operario borra una fila de conteo por error?</h4>
            <p>Simplemente debe presionar la combinación <code>Ctrl + Z</code> en su teclado o pulsar el botón <em>Deshacer</em> en la parte superior de la cédula para restaurar la fila borrada con sus piezas intactas.</p>
          </div>
          <div class="faq-item">
            <h4>¿Se pueden descargar los códigos QR para imprimirlos en una rotuladora térmica?</h4>
            <p>Sí. Puedes descargarlos de forma individual en PNG con el nombre de su código, o descargar el paquete ZIP del anaquel. Las imágenes cuentan con alta resolución (H) y bordes nítidos para lectura con lectores láser e infrarrojos.</p>
          </div>
          <div class="faq-item">
            <h4>¿Por qué el total oficial de anaqueles es de 170 y no 171?</h4>
            <p>Porque el área de documentos de Planta Alta (<code>PA-DOC-01</code>) era una zona administrativa que no almacena refacciones. Al depurarse, quedaron formalizados 87 anaqueles en Planta Baja y 83 en Planta Alta (exactamente 170 anaqueles oficiales).</p>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .guide-container {
      max-width: 1440px;
      margin: 0 auto;
      padding: 1.25rem 1rem 2.5rem 1rem;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }

    .guide-hero {
      background: linear-gradient(135deg, #0a2472 0%, #1e3a8a 100%);
      border-radius: var(--radius-lg, 12px);
      padding: 2rem 2.25rem;
      color: #ffffff;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 2rem;
      flex-wrap: wrap;
      box-shadow: 0 4px 20px rgba(10, 36, 114, 0.16);
      border: 1px solid rgba(255, 255, 255, 0.12);
    }

    .hero-left {
      max-width: 840px;
    }

    .kicker-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 0.5rem;
      flex-wrap: wrap;
    }

    .guide-kicker {
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0.1em;
      color: #93c5fd;
      text-transform: uppercase;
    }

    .hero-chip {
      font-size: 0.68rem;
      font-weight: 800;
      font-family: 'JetBrains Mono', monospace;
      background: rgba(255, 255, 255, 0.15);
      border: 1px solid rgba(255, 255, 255, 0.25);
      color: #ffffff;
      padding: 2px 8px;
      border-radius: 999px;
      letter-spacing: 0.04em;
    }

    .guide-title {
      font-size: 1.85rem;
      font-weight: 800;
      margin: 0 0 0.65rem 0;
      letter-spacing: -0.02em;
      line-height: 1.2;
    }

    .guide-desc {
      font-size: 0.92rem;
      line-height: 1.6;
      color: #e2e8f0;
      margin: 0;
    }

    .guide-desc strong {
      color: #ffffff;
    }

    .quick-links-box {
      background: rgba(255, 255, 255, 0.08);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: var(--radius-md, 8px);
      padding: 1.15rem 1.35rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      min-width: 260px;
    }

    .box-title {
      font-size: 0.72rem;
      font-weight: 800;
      color: #cbd5e1;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 0.25rem;
    }

    .hero-link {
      color: #ffffff;
      text-decoration: none;
      font-weight: 600;
      font-size: 0.85rem;
      padding: 0.4rem 0.6rem;
      border-radius: 6px;
      transition: all 0.15s ease;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .hero-link:hover {
      background: rgba(255, 255, 255, 0.2);
      border-color: rgba(255, 255, 255, 0.3);
      transform: translateX(3px);
    }

    /* Summary Metrics Strip */
    .summary-metrics-strip {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 0.75rem;
    }

    .sm-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: var(--radius-md, 8px);
      padding: 0.85rem 1.15rem;
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
      transition: all 0.15s ease;
    }
    .sm-card:hover {
      border-color: #cbd5e1;
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(15, 23, 42, 0.06);
    }

    .sm-lbl {
      font-size: 0.68rem;
      font-weight: 700;
      text-transform: uppercase;
      color: #64748b;
      letter-spacing: 0.05em;
    }

    .sm-val {
      font-size: 1.15rem;
      font-weight: 800;
      color: #0f172a;
      line-height: 1.25;
    }

    .sm-sub {
      font-size: 0.74rem;
      color: #64748b;
    }

    .text-primary-brand { color: #1d4ed8; }
    .text-success { color: #059669; }
    .text-accent { color: #7c3aed; }
    .mono { font-family: 'JetBrains Mono', monospace; }

    /* Protocol Cards Grid */
    .protocol-grid {
      display: flex;
      flex-direction: column;
      gap: 1.1rem;
    }

    .protocol-card {
      background: #ffffff;
      border: 1px solid var(--border-color, #e2e8f0);
      border-radius: var(--radius-lg, 12px);
      padding: 1.4rem 1.6rem;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
      transition: all 0.15s ease;
    }
    .protocol-card:hover {
      border-color: #cbd5e1;
      box-shadow: 0 4px 14px rgba(15, 23, 42, 0.06);
    }
    .protocol-card.highlight-card {
      border-left: 5px solid #1d4ed8;
    }

    .card-step-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 0.85rem;
    }

    .step-badge {
      font-size: 0.72rem;
      font-weight: 800;
      padding: 0.25rem 0.65rem;
      border-radius: 9999px;
      background: #f1f5f9;
      color: #475569;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border: 1px solid #e2e8f0;
    }
    .badge-primary {
      background: #eff6ff;
      color: #1d4ed8;
      border-color: #bfdbfe;
    }
    .badge-accent {
      background: #faf5ff;
      color: #7c3aed;
      border-color: #e9d5ff;
    }
    .badge-success {
      background: #ecfdf5;
      color: #047857;
      border-color: #a7f3d0;
    }

    .step-title {
      font-size: 1.18rem;
      font-weight: 800;
      color: #0f172a;
      margin: 0;
      letter-spacing: -0.01em;
    }

    .card-body p {
      font-size: 0.9rem;
      color: #334155;
      line-height: 1.6;
      margin: 0 0 0.75rem 0;
    }

    .guide-checklist {
      margin: 0;
      padding-left: 1.25rem;
      color: #334155;
      font-size: 0.88rem;
      line-height: 1.7;
    }
    .guide-checklist li {
      margin-bottom: 0.4rem;
    }
    .guide-checklist strong {
      color: #0f172a;
    }

    .feature-pills-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 0.85rem;
      margin-top: 0.75rem;
    }

    .feature-item {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 0.85rem 1rem;
      font-size: 0.85rem;
      color: #334155;
      line-height: 1.55;
      transition: all 0.15s ease;
    }
    .feature-item:hover {
      background: #ffffff;
      border-color: #cbd5e1;
      box-shadow: 0 2px 6px rgba(15, 23, 42, 0.05);
    }
    .feature-item strong {
      display: block;
      color: #0f172a;
      margin-bottom: 0.25rem;
    }
    .feature-item code {
      background: #f1f5f9;
      padding: 2px 5px;
      border-radius: 4px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8rem;
      color: #0a2472;
    }

    /* FAQ Card */
    .guide-faq-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: var(--radius-lg, 12px);
      padding: 1.65rem 1.75rem;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
    }

    .faq-main-title {
      font-size: 1.15rem;
      font-weight: 800;
      color: #0f172a;
      margin: 0 0 1.25rem 0;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 0.75rem;
      letter-spacing: -0.01em;
    }

    .faq-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 1.25rem;
    }

    .faq-item {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 1rem 1.15rem;
    }

    .faq-item h4 {
      font-size: 0.9rem;
      font-weight: 800;
      color: #0a2472;
      margin: 0 0 0.4rem 0;
      line-height: 1.4;
    }

    .faq-item p {
      font-size: 0.84rem;
      color: #475569;
      line-height: 1.6;
      margin: 0;
    }
  `]
})
export class GuideComponent {}
