import { Component, OnInit, signal, computed, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subject, of } from 'rxjs';
import { debounceTime, switchMap, distinctUntilChanged } from 'rxjs/operators';
import * as QRCode from 'qrcode';
import {
  ApiService,
  InventorySessionSummary,
  ShelfAssignmentDto,
  ProductDto
} from '../services/api.service';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';
import { PatternSuggesterService, SuggestionItem, SimilarCodeAlert } from '../services/pattern-suggester.service';

export interface SheetRow {
  id?: number;              // Database ID if saved
  tempId: string;           // Local unique key
  code: string;             // Raw entered code
  quantity: number | null;  // Number of pieces
  unit: string;
  inCatalog: boolean;
  notes?: string;
  isDuplicate?: boolean;
  duplicateInfo?: string;
  isNew?: boolean;
  similarAlert?: SimilarCodeAlert;
}

@Component({
  selector: 'app-capture',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="cedula-page">
      <!-- Official Interflu Header / Toolbar -->
      <div class="cedula-header-card">
        <div class="header-main">
          <div class="brand-folio">
            <img src="/logo_interflu_official.png" alt="Interflu Inventory" class="cedula-logo" />
            <div>
              <div class="system-title">INTERFLU &bull; INTERNACIONAL DE FLUIDOS S.A. DE C.V.</div>
              <h1 class="folio-title">
                Cédula de Conteo Físico &bull; <span class="mono accent">{{ currentSession()?.folio || 'SIN SESIÓN' }}</span>
                <span class="status-badge" [ngClass]="currentStatusClass()">
                  <span class="status-dot"></span>
                  {{ currentStatusLabel() }}
                </span>
              </h1>
            </div>
          </div>

          <!-- Quick Actions & Status Lifecycle -->
          <div class="header-actions">
            <button
              class="btn btn-primary"
              [disabled]="!isEditable() || saving()"
              (click)="saveEntireSheet()"
              title="Guardar todos los renglones en la base de datos"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                <polyline points="17 21 17 13 7 13 7 21"></polyline>
                <polyline points="7 3 7 8 15 8"></polyline>
              </svg>
              <span>{{ saving() ? 'Guardando...' : 'Guardar Cédula' }}</span>
              <span class="unsaved-badge" *ngIf="hasUnsavedChanges()">* Sin guardar</span>
            </button>

            <!-- Export to SAE: Shelf vs Global Consolidated -->
            <button
              class="btn btn-outline"
              (click)="exportCurrentShelf('CSV')"
              [disabled]="selectedShelfId() === 0"
              title="Descargar archivo de este anaquel para Aspel SAE"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              Exportar Anaquel (SAE)
            </button>

            <button
              class="btn btn-outline"
              (click)="exportGlobalConsolidated('CSV')"
              title="Descargar archivo consolidado global de todos los anaqueles para PIs de Aspel SAE"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              Consolidado Global (PI)
            </button>

            <!-- Import Excel for counted shelves -->
            <button
              class="btn btn-outline"
              (click)="openImportExcelModal()"
              title="Importar archivo de Excel con anaqueles ya contados para marcarlos automáticamente en verde en el croquis"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
              Importar Excel Contado
            </button>

            <!-- Shortcut to QR Labels -->
            <a
              routerLink="/qr-labels"
              [queryParams]="{ sessionId: selectedSessionId() }"
              class="btn btn-outline"
              title="Ver o imprimir etiquetas QR de los materiales de este inventario"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="7" height="7"></rect>
                <rect x="14" y="3" width="7" height="7"></rect>
                <rect x="14" y="14" width="7" height="7"></rect>
                <rect x="3" y="14" width="7" height="7"></rect>
              </svg>
              Etiquetas QR
            </a>

            <!-- Status Lifecycle -->
            <button
              *ngIf="isEditable()"
              class="btn btn-success-light"
              (click)="markAsSuccess()"
              title="Cerrar y marcar como importación exitosa para Aspel SAE"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              Marcar Éxito SAE
            </button>

            <button
              *ngIf="isEditable() && currentSession()?.status === 'EN_CONTEO'"
              class="btn btn-warning-light"
              (click)="markAsPendingReview()"
              title="Poner en revisión antes de cerrar"
            >
              En Revisión
            </button>

            <button
              *ngIf="!isEditable()"
              class="btn btn-accent"
              (click)="openReopenModal()"
              title="Reabrir cédula para continuar capturando o agregar piezas faltantes"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
              </svg>
              Reabrir Cédula
            </button>
          </div>
        </div>

        <!-- Metadata & Selector Controls -->
        <div class="selector-row">
          <div class="selector-group">
            <label class="field-label">Inventario / Folio</label>
            <div class="input-with-action">
              <select class="select-field" [ngModel]="selectedSessionId()" (ngModelChange)="onSessionChange($event)">
                <option *ngFor="let s of sessions()" [value]="s.id">
                  {{ s.folio }} &bull; {{ s.title }} [{{ s.status }}]
                </option>
              </select>
              <button class="btn btn-sm btn-ghost" (click)="openCreateSessionModal()" title="Crear nuevo folio">
                + Nuevo
              </button>
            </div>
          </div>

          <div class="selector-group">
            <label class="field-label">Anaquel / Ubicación Física</label>
            <div class="input-with-action">
              <select class="select-field" [ngModel]="selectedShelfId()" (ngModelChange)="onShelfChange($event)">
                <option [ngValue]="0">-- Selecciona anaquel para abrir cédula --</option>
                <option *ngFor="let sh of shelves()" [value]="sh.shelfId">
                  [{{ sh.plant || 'Planta 1' }}] {{ sh.shelfCode }} &bull; {{ sh.shelfZone }} ({{ sh.totalPieces }} pzas)
                </option>
              </select>
              <button *ngIf="selectedShelfId() > 0" class="btn btn-sm btn-ghost" (click)="openEditCurrentShelfModal()" title="Editar nombre o código de este anaquel">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                Editar
              </button>
              <button *ngIf="selectedShelfId() > 0" class="btn btn-sm btn-ghost" (click)="downloadCurrentShelfQrPng()" title="Descargar código QR en imagen PNG para rotular">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                QR (.png)
              </button>
            </div>
          </div>

          <div class="meta-indicators">
            <div class="indicator-item">
              <span class="ind-label">Partidas Contadas</span>
              <span class="ind-val mono">{{ validRowCount() }}</span>
            </div>
            <div class="indicator-item">
              <span class="ind-label">Piezas Físicas</span>
              <span class="ind-val mono text-primary-brand">{{ totalPieces() | number:'1.0-2' }}</span>
            </div>
            <div class="indicator-item" [class.has-duplicates]="duplicateCount() > 0">
              <span class="ind-label">Repetidos</span>
              <span class="ind-val mono" [class.text-danger]="duplicateCount() > 0">{{ duplicateCount() }}</span>
            </div>
            <div class="indicator-item">
              <span class="ind-label">Operador</span>
              <span class="ind-val text-muted">{{ auth.user()?.fullName || 'Osiris' }}</span>
            </div>
          </div>
        </div>

        <!-- Lock Warning if not editable -->
        <div class="lock-banner" *ngIf="!isEditable()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
          <div>
            <strong>Cédula Cerrada y Protegida ({{ currentSession()?.status }}).</strong>
            La lista de materiales está blindada contra modificaciones accidentales. Para agregar partidas o ajustar piezas, pulsa <strong>Reabrir Cédula</strong>.
          </div>
          <button class="btn btn-sm btn-outline-white" (click)="openReopenModal()">Reabrir Cédula Ahora</button>
        </div>

        <!-- Duplicate Warning Banner -->
        <div class="duplicate-banner" *ngIf="duplicateCount() > 0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
          <div>
            <strong>Atención: Se detectaron {{ duplicateCount() }} códigos repetidos en este anaquel.</strong>
            Se señalizan con borde ámbar y la fila correspondiente para agilizar la revisión física.
          </div>
          <button class="btn btn-sm btn-warning" (click)="consolidateDuplicates()" title="Sumar piezas de códigos duplicados y unificar renglones">
            Sumar y Consolidar Repetidos
          </button>
        </div>

        <!-- Similar Code Smart Alert Banner -->
        <div class="similar-code-banner" *ngIf="activeRowSimilarAlert() as sim">
          <div class="similar-text">
            <strong>Atención &bull; Código Similar Detectado:</strong>
            El código escrito se parece mucho a <span class="mono fw-700 font-code-chip">{{ sim.similarTo }}</span> ({{ sim.reason }}).
            <span class="sub-detail">{{ sim.detail }}</span>
          </div>
          <button class="btn btn-sm btn-outline-primary" type="button" (click)="applySimilarCode(sim.similarTo)">
            Sustituir por {{ sim.similarTo }}
          </button>
        </div>

        <!-- Quick Pattern Chips Bar (Autodidacta / Fracciones Refaccionaria) -->
        <div class="pattern-chips-bar" *ngIf="isEditable() && selectedShelfId() > 0">
          <div class="chips-header-row">
            <span class="chips-title">Atajos y Medidas Dinámicas:</span>
            <span class="chips-smart-tag" *ngIf="learnedCount() > 0">
              Autodidacta: {{ learnedCount() }} atajos aprendidos en vivo
            </span>
          </div>
          <div class="chips-list">
            <button
              *ngFor="let chip of quickChips"
              type="button"
              class="chip-btn mono"
              (click)="appendChipToActive(chip)"
            >
              {{ chip }}
            </button>
          </div>
        </div>
      </div>

      <!-- Cédula Sheet Container -->
      <div class="cedula-sheet-card" *ngIf="selectedShelfId() > 0; else noShelfSelected">
        <!-- Sheet Toolbar -->
        <div class="sheet-toolbar">
          <div class="toolbar-left">
            <button
              class="btn btn-sm btn-outline"
              [disabled]="!isEditable()"
              (click)="addRowAtEnd()"
              title="Agregar renglón en blanco al final de la cédula"
            >
              + Agregar Renglón al Final
            </button>
            <button
              class="btn btn-sm btn-outline"
              [disabled]="!isEditable()"
              (click)="openPasteModal()"
              title="Pegar datos copiados directamente desde Excel (Ctrl+V)"
            >
              Pegar desde Excel
            </button>
            <button
              class="btn btn-sm btn-ghost"
              [disabled]="!isEditable()"
              (click)="removeEmptyRows()"
              title="Limpiar filas vacías sin código"
            >
              Limpiar Filas Vacías
            </button>
            <button
              class="btn btn-sm btn-ghost text-danger"
              [disabled]="!isEditable() || (validRowCount() === 0 && totalPieces() === 0)"
              (click)="openClearCurrentShelfModal()"
              title="Eliminar conteos únicamente de este anaquel y ponerlo en 0 piezas"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              Limpiar Anaquel
            </button>
          </div>

          <div class="toolbar-right">
            <span class="keyboard-tip text-muted">
              Flujo Rápido: Escribe el código &rarr; pulsa <strong>Enter</strong> para piezas &rarr; pulsa <strong>Enter</strong> para la siguiente fila.
            </span>
          </div>
        </div>

        <!-- The Spreadsheet Grid Table (DESCRIPCION REMOVED TO MAXIMIZE SPEED) -->
        <div class="table-container" (paste)="onTablePaste($event)">
          <table class="cedula-table">
            <thead>
              <tr>
                <th class="th-row-num">#</th>
                <th class="th-code">Código / Clave Material</th>
                <th class="th-qty">Piezas (Físico)</th>
                <th class="th-status">Estado / Alerta</th>
                <th class="th-actions" *ngIf="isEditable()">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr
                *ngFor="let row of rows(); let i = index"
                [class.row-duplicate]="row.isDuplicate"
                [class.row-saved]="row.id && !row.isNew"
                [class.row-focused]="activeRowIndex === i"
              >
                <!-- Row Number -->
                <td class="td-row-num mono">{{ i + 1 }}</td>

                <!-- Code Input Cell -->
                <td class="td-code relative">
                  <div class="cell-input-wrap">
                    <input
                      #codeInput
                      type="text"
                      class="cell-input mono"
                      [class.input-duplicate]="row.isDuplicate"
                      [(ngModel)]="row.code"
                      (focus)="onCellFocus(i, 'code')"
                      (input)="onCodeInput(i, $any($event.target).value)"
                      (keydown)="onCodeKeyDown($event, i)"
                      [disabled]="!isEditable()"
                      placeholder="Clave interna de refacción"
                      autocomplete="off"
                    />
                    <button *ngIf="row.code && isEditable()" type="button" class="btn-cell-clear" (click)="clearRowCode(i)">✕</button>
                  </div>

                  <!-- Autocomplete Suggestions Dropdown -->
                  <div
                    class="autocomplete-box"
                    *ngIf="activeRowIndex === i && activeCellType === 'code' && currentSuggestions().length > 0"
                  >
                    <div
                      class="autocomplete-item"
                      *ngFor="let sugg of currentSuggestions()"
                      (mousedown)="selectSuggestion(i, sugg)"
                    >
                      <div class="sugg-header">
                        <span class="mono sugg-code">{{ sugg.code }}</span>
                        <span class="sugg-badge" [ngClass]="sugg.source">{{ sugg.source }}</span>
                      </div>
                      <div class="sugg-desc">{{ sugg.description }}</div>
                    </div>
                  </div>
                </td>

                <!-- Pieces / Quantity Cell -->
                <td class="td-qty">
                  <input
                    #qtyInput
                    type="number"
                    step="any"
                    min="0"
                    class="cell-input mono text-right qty-input"
                    [(ngModel)]="row.quantity"
                    (focus)="onCellFocus(i, 'qty')"
                    (input)="onQuantityChange(i)"
                    (keydown)="onQtyKeyDown($event, i)"
                    [disabled]="!isEditable()"
                    placeholder="0"
                  />
                </td>

                <!-- Status / Alert Cell -->
                <td class="td-status">
                  <span *ngIf="row.isDuplicate" class="alert-pill duplicate">
                    Repetido ({{ row.duplicateInfo }})
                  </span>
                  <span *ngIf="!row.isDuplicate && row.inCatalog" class="alert-pill catalog">
                    Catálogo
                  </span>
                  <span *ngIf="!row.isDuplicate && !row.inCatalog && row.code" class="alert-pill new-code">
                    Válido
                  </span>
                  <span *ngIf="row.similarAlert && !row.isDuplicate && !row.inCatalog" class="alert-pill similar-pill" [title]="row.similarAlert.detail">
                    Similar: {{ row.similarAlert.similarTo }}
                  </span>
                </td>

                <!-- Row Actions (Insert Intermediate Row "en media celda", Delete) -->
                <td class="td-actions" *ngIf="isEditable()">
                  <div class="action-buttons">
                    <button
                      type="button"
                      class="action-btn insert-btn"
                      (click)="insertRowBelow(i)"
                      title="Insertar fila intermedia en media celda aquí"
                    >
                      + Fila
                    </button>
                    <button
                      type="button"
                      class="action-btn delete-btn"
                      (click)="deleteRow(i)"
                      title="Eliminar este renglón"
                    >
                      ✕
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Bottom Sheet Footer -->
        <div class="sheet-footer">
          <div class="footer-left">
            <button
              class="btn btn-outline"
              [disabled]="!isEditable()"
              (click)="addRowAtEnd()"
            >
              + Agregar Renglón al Final
            </button>
            <span class="footer-summary text-muted">
              Mostrando <strong>{{ rows().length }}</strong> renglones en anaquel <strong>{{ currentShelf()?.shelfCode }}</strong>
            </span>
          </div>

          <div class="footer-right">
            <button
              class="btn btn-primary btn-lg"
              [disabled]="!isEditable() || saving()"
              (click)="saveEntireSheet()"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px; vertical-align: -2px;">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                <polyline points="17 21 17 13 7 13 7 21"></polyline>
                <polyline points="7 3 7 8 15 8"></polyline>
              </svg>
              {{ saving() ? 'Guardando en BD...' : 'Guardar Cédula Completa' }}
            </button>
          </div>
        </div>
      </div>

      <!-- No Shelf Selected Prompt -->
      <ng-template #noShelfSelected>
        <div class="empty-prompt-card">
          <div class="prompt-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
            </svg>
          </div>
          <h3>Selecciona un Anaquel para Abrir la Cédula de Conteo</h3>
          <p class="text-muted">
            Cada folio de inventario se organiza por anaquel físico (Planta 1 o Planta 2).
            Selecciona el anaquel en el desplegable superior o pulsa uno de los accesos directos abajo para iniciar la captura de piezas.
          </p>
          <div class="quick-shelf-buttons">
            <button
              *ngFor="let s of shelves().slice(0, 8)"
              class="shelf-btn-card"
              (click)="selectedShelfId.set(s.shelfId); onShelfChange(s.shelfId)"
            >
              <span class="mono shelf-code">{{ s.shelfCode }}</span>
              <span class="shelf-zone">{{ s.shelfZone }}</span>
              <span class="shelf-cnt">{{ s.totalPieces }} pzas</span>
            </button>
          </div>
        </div>
      </ng-template>

      <!-- Paste from Excel Modal -->
      <div class="modal-overlay" *ngIf="showPasteModal">
        <div class="modal-card">
          <div class="modal-header">
            <h3>Pegar Datos Directos desde Microsoft Excel</h3>
            <button class="btn-close" (click)="showPasteModal = false">✕</button>
          </div>
          <div class="modal-body">
            <p class="text-muted">
              Copia dos columnas en tu archivo de Excel (<strong>Columna 1: Código</strong>, <strong>Columna 2: Cantidad</strong>) y pégalas aquí:
            </p>
            <textarea
              class="textarea mono paste-area"
              rows="8"
              [(ngModel)]="pasteContent"
              placeholder="NM80 3 1/2&#9;15&#10;NMP40 2/4x1/4&#9;8&#10;VAL-ESF-1/2&#9;24"
            ></textarea>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" (click)="showPasteModal = false">Cancelar</button>
            <button class="btn btn-primary" (click)="processPastedData()">Insertar en la Cédula</button>
          </div>
        </div>
      </div>

      <!-- Create Session Modal -->
      <div class="modal-overlay" *ngIf="showCreateSessionModal">
        <div class="modal-card">
          <div class="modal-header">
            <h3>Crear Nuevo Folio de Inventario</h3>
            <button class="btn-close" (click)="showCreateSessionModal = false">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="field-label">Título del Inventario</label>
              <input type="text" class="input" [(ngModel)]="newSessionTitle" placeholder="Inventario General Refacciones" />
            </div>
            <div class="form-group">
              <label class="field-label">Almacén</label>
              <select class="select-field" [(ngModel)]="newSessionWarehouse">
                <option value="1">1 - Almacén Principal Interflu</option>
                <option value="2">2 - Almacén Planta 2 Pesado</option>
              </select>
            </div>
            <div class="form-group">
              <label class="field-label">Notas / Observaciones</label>
              <textarea class="textarea" rows="2" [(ngModel)]="newSessionNotes" placeholder="Observaciones técnicas de la sesión..."></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" (click)="showCreateSessionModal = false">Cancelar</button>
            <button class="btn btn-primary" (click)="submitCreateSession()">Crear Folio</button>
          </div>
        </div>
      </div>

      <!-- Reopen Session Modal -->
      <div class="modal-overlay" *ngIf="showReopenModal">
        <div class="modal-card">
          <div class="modal-header">
            <h3>Reabrir Cédula de Inventario</h3>
            <button class="btn-close" (click)="showReopenModal = false">✕</button>
          </div>
          <div class="modal-body">
            <p class="text-muted">
              Al reabrir esta cédula, se desbloquearán las celdas para agregar partidas omitidas o ajustar piezas. La lista completa de partidas registradas se mantendrá íntegra.
            </p>
            <div class="form-group">
              <label class="field-label">Motivo de Reapertura (Requerido)</label>
              <input type="text" class="input" [(ngModel)]="reopenReason" placeholder="Conteo complementario de anaquel o piezas no registradas" />
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" (click)="showReopenModal = false">Cancelar</button>
            <button class="btn btn-primary" (click)="submitReopenSession()">Reabrir y Desbloquear</button>
          </div>
        </div>
      </div>

      <!-- Import Excel Counts File Modal -->
      <div class="modal-overlay" *ngIf="showImportExcelModal">
        <div class="modal-card">
          <div class="modal-header">
            <h3>Importar Excel de Anaqueles Contados</h3>
            <button class="btn-close" (click)="closeImportExcelModal()">✕</button>
          </div>
          <div class="modal-body">
            <p class="text-muted">
              Carga tu archivo de Excel (<strong>.xlsx</strong> o <strong>.csv</strong>) con los conteos ya realizados. El sistema registrará los materiales, marcará automáticamente los anaqueles correspondientes en <strong>VERDE (Contabilizado)</strong> en el croquis y generará los códigos QR listos para imprimir.
            </p>
            <div class="excel-format-hints">
              <span class="hint-title">Formatos de columnas compatibles Aspel SAE / Excel:</span>
              <div class="mono hint-cols">ESTATUS | TIPO | CLAVE | CLAVE ESQ | EXISTENCIA FÍSICA</div>
              <div class="font-xs text-secondary mt-1">O formato simplificado: ANAQUEL | CÓDIGO | PIEZAS</div>
            </div>

            <div class="form-group mt-3 mb-2">
              <label class="field-label">Asignación de Anaquel Destino:</label>
              <select class="select-field" [ngModel]="importTargetShelfId()" (ngModelChange)="importTargetShelfId.set($event)">
                <option [ngValue]="0">Detectar automáticamente (o según columna en archivo)</option>
                <option *ngFor="let sh of shelves()" [value]="sh.shelfId">
                  Asignar todo a: [{{ sh.plant || 'Planta 1' }}] {{ sh.shelfCode }} &bull; {{ sh.shelfZone }}
                </option>
              </select>
            </div>
            
            <div class="file-drop-area mt-2" (click)="fileInput.click()">
              <input #fileInput type="file" accept=".xlsx,.xls,.csv" style="display: none;" (change)="onFileSelectedForImport($event)" />
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
              <div *ngIf="!selectedExcelFile">
                <strong>Haz clic aquí para seleccionar el archivo Excel (.xlsx / .csv)</strong>
                <div class="font-xs text-muted">Compatible con exportaciones de conteo físico y catálogos &bull; Hasta 50MB</div>
              </div>
              <div *ngIf="selectedExcelFile" class="selected-file-info">
                <strong class="text-primary-brand">{{ selectedExcelFile.name }}</strong>
                <span class="font-xs text-muted">({{ (selectedExcelFile.size / 1024) | number:'1.1-2' }} KB)</span>
              </div>
            </div>

            <div *ngIf="importResult" class="import-summary-card">
              <div class="font-sm text-success fw-700">✓ Archivo importado correctamente:</div>
              <ul class="font-xs mt-1">
                <li><strong>{{ importResult.importedRecords }}</strong> partidas de materiales registradas.</li>
                <li><strong>{{ importResult.totalPieces | number:'1.0-2' }}</strong> piezas físicas contabilizadas.</li>
                <li><strong>{{ importResult.shelvesUpdated }}</strong> anaqueles actualizados y marcados en verde:
                  <span class="mono">{{ importResult.affectedShelves?.join(', ') }}</span>
                </li>
              </ul>
              <div class="mt-2 flex gap-2">
                <a routerLink="/croquis" class="btn btn-sm btn-outline-primary">Ver Croquis (Verdes) &rarr;</a>
                <a routerLink="/qr-labels" [queryParams]="{sessionId: selectedSessionId()}" class="btn btn-sm btn-success">Ver Etiquetas QR &rarr;</a>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" (click)="closeImportExcelModal()">{{ importResult ? 'Cerrar' : 'Cancelar' }}</button>
            <button
              class="btn btn-primary"
              [disabled]="!selectedExcelFile || importingExcel()"
              (click)="submitImportExcel()"
            >
              {{ importingExcel() ? 'Importando y Marcando...' : 'Importar y Marcar Contabilizados' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Modal: Edit Shelf Details -->
      <div class="modal-backdrop" *ngIf="editingShelf" (click)="editingShelf = null">
        <div class="modal-box" (click)="$event.stopPropagation()">
          <div class="modal-header-row" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 14px;">
            <h3 class="modal-title" style="margin: 0;">Editar Anaquel</h3>
            <button class="btn-close" (click)="editingShelf = null">✕</button>
          </div>
          <p class="modal-desc">Modifica el código, zona o sector físico de este anaquel. El cambio se reflejará en el croquis y en todas las cédulas.</p>
          <div class="form-stack">
            <div class="two-cols">
              <div>
                <label class="label">Código de Anaquel</label>
                <input class="input mono" [(ngModel)]="editingShelf.code" placeholder="Ej. PB-ACE-05" />
              </div>
              <div>
                <label class="label">Nivel de Planta</label>
                <select class="select" [(ngModel)]="editingShelf.plant">
                  <option value="Planta Baja">Planta Baja</option>
                  <option value="Planta Alta">Planta Alta</option>
                </select>
              </div>
            </div>
            <div>
              <label class="label">Zona / Sector</label>
              <input class="input" [(ngModel)]="editingShelf.zone" placeholder="Ej. Acero (1-19), Kuriyama, Sellos" />
            </div>
            <div>
              <label class="label">Descripción Adicional</label>
              <input class="input" [(ngModel)]="editingShelf.description" placeholder="Ej. Pasillo principal frente a comedor" />
            </div>
          </div>
          <div class="modal-footer" style="margin-top: 18px;">
            <button class="btn btn-outline" (click)="editingShelf = null" [disabled]="savingShelf()">Cancelar</button>
            <button class="btn btn-primary" (click)="saveCurrentShelfEdit()" [disabled]="savingShelf()">
              {{ savingShelf() ? 'Guardando...' : 'Guardar Cambios' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Modal: Confirm Clear Single Shelf Counts -->
      <div class="modal-backdrop" *ngIf="showClearShelfModal && currentShelf() as sh" (click)="showClearShelfModal = false">
        <div class="modal-box" (click)="$event.stopPropagation()">
          <h3 class="modal-title text-danger">Limpiar Conteos del Anaquel</h3>
          <p class="modal-desc">
            ¿Deseas eliminar todas las partidas contabilizadas en el anaquel <strong class="mono">{{ sh.shelfCode }}</strong>?
          </p>
          <div class="delete-warning-box">
            <strong>Restablecimiento individual:</strong>
            <ul style="margin: 6px 0 0 16px; padding: 0;">
              <li>Se eliminarán las {{ validRowCount() }} partidas contadas ({{ totalPieces() | number:'1.0-2' }} piezas) de este anaquel.</li>
              <li>El anaquel regresará a estado <strong>PENDIENTE</strong> con 0 piezas en el croquis y en el inventario.</li>
              <li>Los demás anaqueles del almacén <strong>no serán afectados</strong>.</li>
            </ul>
          </div>
          <div class="modal-footer" style="margin-top: 18px;">
            <button class="btn btn-outline" (click)="showClearShelfModal = false" [disabled]="clearingShelf()">Cancelar</button>
            <button class="btn btn-danger" (click)="executeClearCurrentShelf()" [disabled]="clearingShelf()">
              {{ clearingShelf() ? 'Limpiando...' : 'Sí, Limpiar Este Anaquel' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .cedula-page {
      padding: 0;
      max-width: 100%;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }

    /* Header Card */
    .cedula-header-card {
      background: var(--bg-surface, #ffffff);
      border: 1px solid var(--border-color, #e2e8f0);
      border-radius: var(--radius-lg, 12px);
      padding: 1.25rem 1.5rem;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .header-main {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1rem;
    }

    .brand-folio {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .cedula-logo {
      height: 48px;
      width: auto;
      object-fit: contain;
    }

    .system-title {
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted, #64748b);
      font-weight: 700;
    }

    .folio-title {
      margin: 0;
      font-size: 1.35rem;
      font-weight: 700;
      color: var(--brand-navy, #0a2472);
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .accent {
      color: var(--brand-blue, #1d4ed8);
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .unsaved-badge {
      font-size: 0.7rem;
      color: #fef08a;
      margin-left: 0.25rem;
      font-weight: 700;
    }

    /* Status Badges */
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.25rem 0.6rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .status-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
    }
    .status-conteo {
      background: #eff6ff;
      color: #1d4ed8;
      border: 1px solid #bfdbfe;
    }
    .status-conteo .status-dot {
      background: #2563eb;
    }
    .status-revision {
      background: #fffbeb;
      color: #b45309;
      border: 1px solid #fde68a;
    }
    .status-revision .status-dot { background: #d97706; }
    .status-exito {
      background: #ecfdf5;
      color: #047857;
      border: 1px solid #a7f3d0;
    }
    .status-exito .status-dot { background: #059669; }
    .status-reabierto {
      background: #f0fdf4;
      color: #0369a1;
      border: 1px solid #bae6fd;
    }
    .status-reabierto .status-dot { background: #0284c7; }

    /* Selector Controls */
    .selector-row {
      display: grid;
      grid-template-columns: 1.5fr 1.5fr 2fr;
      gap: 1.25rem;
      align-items: end;
      padding-top: 0.5rem;
      border-top: 1px solid var(--border-color, #e2e8f0);
    }

    @media (max-width: 900px) {
      .selector-row { grid-template-columns: 1fr; }
    }

    .selector-group {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }

    .field-label {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-secondary, #334155);
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .input-with-action {
      display: flex;
      gap: 0.35rem;
    }

    .select-field {
      flex: 1;
      height: 38px;
      padding: 0 0.75rem;
      border: 1px solid var(--border-color, #cbd5e1);
      border-radius: var(--radius-sm, 6px);
      background: #ffffff;
      font-size: 0.85rem;
      color: var(--text-primary, #0f172a);
      outline: none;
    }
    .select-field:focus {
      border-color: var(--brand-blue, #1d4ed8);
      box-shadow: 0 0 0 2px rgba(29, 78, 216, 0.15);
    }

    .meta-indicators {
      display: flex;
      justify-content: flex-end;
      gap: 1.25rem;
      flex-wrap: wrap;
    }

    .indicator-item {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      padding: 0.25rem 0.5rem;
      border-radius: var(--radius-sm, 6px);
    }
    .indicator-item.has-duplicates {
      background: #fffbeb;
      border: 1px solid #fde68a;
    }

    .ind-label {
      font-size: 0.68rem;
      color: var(--text-muted, #64748b);
      text-transform: uppercase;
      font-weight: 600;
    }
    .ind-val {
      font-size: 1.15rem;
      font-weight: 700;
      color: var(--text-primary, #0f172a);
    }
    .text-primary-brand { color: var(--brand-blue, #1d4ed8); }
    .text-danger { color: #dc2626; }

    /* Warning Banners */
    .lock-banner, .duplicate-banner {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      border-radius: var(--radius-sm, 6px);
      font-size: 0.85rem;
    }
    .lock-banner {
      background: #1e293b;
      color: #ffffff;
    }
    .duplicate-banner {
      background: #fffbeb;
      border: 1px solid #fde68a;
      color: #92400e;
    }
    .similar-code-banner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.65rem 1rem;
      border-radius: var(--radius-sm, 6px);
      font-size: 0.85rem;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      color: #1e40af;
    }
    .similar-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .font-code-chip {
      background: #dbeafe;
      padding: 1px 6px;
      border-radius: 4px;
      color: #1e3a8a;
    }
    .sub-detail {
      font-size: 0.75rem;
      color: #2563eb;
    }
    .btn-outline-primary {
      background: #ffffff;
      border: 1px solid #2563eb;
      color: #1d4ed8;
      border-radius: 4px;
      padding: 0.3rem 0.75rem;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
    }
    .btn-outline-primary:hover {
      background: #eff6ff;
    }

    /* Pattern Chips Bar */
    .pattern-chips-bar {
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
      padding: 0.6rem 0;
      border-top: 1px dashed var(--border-color, #e2e8f0);
    }
    .chips-header-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
    }
    .chips-title {
      font-size: 0.72rem;
      font-weight: 700;
      color: var(--text-muted, #64748b);
      white-space: nowrap;
      text-transform: uppercase;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .chips-smart-tag {
      font-size: 0.7rem;
      font-weight: 700;
      color: #0369a1;
      background: #e0f2fe;
      border: 1px solid #bae6fd;
      padding: 2px 8px;
      border-radius: 999px;
      letter-spacing: 0.02em;
    }
    .chips-list {
      display: flex;
      gap: 0.35rem;
      overflow-x: auto;
      padding-bottom: 2px;
      scrollbar-width: thin;
      flex-wrap: nowrap;
    }
    .chip-btn {
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 0.25rem 0.6rem;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      color: #1e293b;
      white-space: nowrap;
      transition: all 0.15s ease;
    }
    .chip-btn:hover {
      background: #e0f2fe;
      border-color: #0284c7;
      color: #0369a1;
      transform: translateY(-1px);
    }

    /* Cédula Sheet Card */
    .cedula-sheet-card {
      background: #ffffff;
      border: 1px solid var(--border-color, #cbd5e1);
      border-radius: var(--radius-lg, 12px);
      box-shadow: 0 4px 14px -2px rgba(15, 23, 42, 0.08);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .sheet-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.6rem 1rem;
      background: #f8fafc;
      border-bottom: 1px solid var(--border-color, #cbd5e1);
      flex-wrap: wrap;
      gap: 0.75rem;
    }

    .toolbar-left {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .table-container {
      overflow-x: auto;
      max-height: 620px;
      position: relative;
      scrollbar-width: thin;
      scrollbar-color: #94a3b8 #f1f5f9;
      width: 100%;
    }

    /* Cédula Table */
    .cedula-table {
      width: 100%;
      min-width: 1040px;
      border-collapse: collapse;
      font-size: 0.9rem;
      table-layout: fixed;
    }

    .cedula-table th {
      background: #f1f5f9;
      color: #334155;
      font-weight: 700;
      text-align: left;
      padding: 0.55rem 0.75rem;
      border-bottom: 2px solid #cbd5e1;
      border-right: 1px solid #e2e8f0;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      position: sticky;
      top: 0;
      z-index: 10;
    }

    .cedula-table td {
      padding: 0.25rem 0.5rem;
      border-bottom: 1px solid #e2e8f0;
      border-right: 1px solid #f1f5f9;
      vertical-align: middle;
    }

    .cedula-table tr:hover {
      background-color: #f8fafc;
    }

    .row-focused {
      background-color: #f0fdf4 !important;
    }

    .row-duplicate {
      background-color: #fefce8 !important;
    }

    .th-row-num, .td-row-num {
      width: 50px;
      text-align: center;
      background: #f8fafc;
      color: #64748b;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .th-code { width: 450px; }
    .th-qty { width: 180px; }
    .th-status { width: 220px; }
    .th-actions { width: 140px; }

    /* Inputs in Cells */
    .cell-input-wrap {
      position: relative;
      width: 100%;
    }

    .cell-input {
      width: 100%;
      height: 34px;
      border: 1px solid transparent;
      border-radius: 3px;
      padding: 0 0.6rem;
      font-size: 0.92rem;
      color: #0f172a;
      background: transparent;
      outline: none;
      transition: all 0.15s ease;
      box-sizing: border-box;
    }

    .cell-input:focus {
      background: #ffffff;
      border-color: #2563eb;
      box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2);
    }

    .input-duplicate {
      border-color: #f59e0b !important;
      background: #fffbeb !important;
      font-weight: 600;
    }

    .qty-input {
      font-weight: 700;
      color: #1e3a8a;
    }

    .btn-cell-clear {
      position: absolute;
      right: 6px;
      top: 50%;
      transform: translateY(-50%);
      background: transparent;
      border: none;
      font-size: 0.8rem;
      color: #94a3b8;
      cursor: pointer;
    }

    /* Autocomplete Box */
    .autocomplete-box {
      position: absolute;
      top: 100%;
      left: 0;
      width: 360px;
      max-height: 220px;
      overflow-y: auto;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.2);
      z-index: 50;
    }

    .autocomplete-item {
      padding: 0.5rem 0.75rem;
      cursor: pointer;
      border-bottom: 1px solid #f1f5f9;
      transition: background 0.1s;
    }
    .autocomplete-item:hover {
      background: #eff6ff;
    }

    .sugg-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2px;
    }
    .sugg-code {
      font-weight: 700;
      color: #1e40af;
      font-size: 0.85rem;
    }
    .sugg-badge {
      font-size: 0.65rem;
      padding: 1px 5px;
      border-radius: 3px;
      text-transform: uppercase;
      font-weight: 600;
    }
    .sugg-badge.HISTORIAL { background: #e0f2fe; color: #0369a1; }
    .sugg-badge.PATRON { background: #fef3c7; color: #92400e; }
    .sugg-badge.CATALOGO { background: #dcfce7; color: #166534; }

    .sugg-desc {
      font-size: 0.75rem;
      color: #64748b;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Alert Pills */
    .alert-pill {
      display: inline-block;
      font-size: 0.75rem;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      font-weight: 600;
      white-space: nowrap;
    }
    .alert-pill.duplicate {
      background: #fffbeb;
      color: #b45309;
      border: 1px solid #fde68a;
    }
    .alert-pill.similar-pill {
      background: #eff6ff;
      color: #1d4ed8;
      border: 1px solid #bfdbfe;
    }
    .alert-pill.catalog {
      background: #f0fdf4;
      color: #15803d;
      border: 1px solid #bbf7d0;
    }
    .alert-pill.new-code {
      background: #eff6ff;
      color: #1d4ed8;
      border: 1px solid #bfdbfe;
    }

    /* Action Buttons in Cell */
    .action-buttons {
      display: flex;
      gap: 0.35rem;
    }
    .action-btn {
      padding: 0.2rem 0.55rem;
      font-size: 0.75rem;
      border-radius: 4px;
      cursor: pointer;
      font-weight: 600;
      border: 1px solid transparent;
      transition: all 0.1s;
    }
    .insert-btn {
      background: #eff6ff;
      color: #1d4ed8;
      border-color: #bfdbfe;
    }
    .insert-btn:hover {
      background: #dbeafe;
    }
    .delete-btn {
      background: #fef2f2;
      color: #dc2626;
      border-color: #fecaca;
    }
    .delete-btn:hover {
      background: #fee2e2;
    }

    /* Sheet Footer */
    .sheet-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.85rem 1.25rem;
      background: #f8fafc;
      border-top: 1px solid #cbd5e1;
      flex-wrap: wrap;
      gap: 1rem;
    }
    .footer-left {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    /* Empty Prompt Card */
    .empty-prompt-card {
      background: #ffffff;
      border: 2px dashed #cbd5e1;
      border-radius: var(--radius-lg, 12px);
      padding: 3rem 2rem;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
    }
    .prompt-icon {
      color: #64748b;
    }
    .quick-shelf-buttons {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 0.75rem;
      width: 100%;
      max-width: 900px;
      margin-top: 1rem;
    }
    .shelf-btn-card {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 0.75rem 1rem;
      text-align: left;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
      transition: all 0.15s ease;
    }
    .shelf-btn-card:hover {
      background: #eff6ff;
      border-color: #93c5fd;
    }
    .shelf-code {
      font-weight: 700;
      color: #0a2472;
      font-size: 0.95rem;
    }
    .shelf-zone {
      font-size: 0.75rem;
      color: #64748b;
    }
    .shelf-cnt {
      font-size: 0.75rem;
      color: #059669;
      font-weight: 600;
    }

    /* Modal Styles */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(15, 23, 42, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100;
      padding: 1rem;
    }
    .modal-card {
      background: #ffffff;
      border-radius: 12px;
      width: 100%;
      max-width: 540px;
      box-shadow: 0 20px 25px -5px rgba(0,0,0,0.2);
      overflow: hidden;
    }
    .modal-header {
      padding: 1rem 1.25rem;
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .modal-header h3 { margin: 0; font-size: 1.1rem; color: #0f172a; }
    .btn-close { background: none; border: none; font-size: 1.1rem; cursor: pointer; color: #64748b; }
    .modal-body { padding: 1.25rem; display: flex; flex-direction: column; gap: 1rem; }
    .modal-footer { padding: 0.85rem 1.25rem; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 0.5rem; }
    .paste-area { width: 100%; border: 1px solid #cbd5e1; border-radius: 6px; padding: 0.5rem; font-size: 0.82rem; }
    .btn-outline-white { background: transparent; border: 1px solid #ffffff; color: #ffffff; border-radius: 4px; padding: 0.25rem 0.6rem; cursor: pointer; }
    .btn-outline-white:hover { background: rgba(255,255,255,0.15); }
    .btn-success-light { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; border-radius: 6px; padding: 0.45rem 0.85rem; font-weight: 600; cursor: pointer; }
    .btn-warning-light { background: #fffbeb; color: #b45309; border: 1px solid #fde68a; border-radius: 6px; padding: 0.45rem 0.85rem; font-weight: 600; cursor: pointer; }
    .btn-accent { background: #0284c7; color: #ffffff; border: none; border-radius: 6px; padding: 0.45rem 0.85rem; font-weight: 600; cursor: pointer; }
    .excel-format-hints { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.75rem; }
    .hint-title { font-size: 0.72rem; font-weight: 700; color: #64748b; text-transform: uppercase; display: block; margin-bottom: 4px; }
    .hint-cols { font-size: 0.82rem; font-weight: 700; color: #0a2472; }
    .file-drop-area { border: 2px dashed #93c5fd; background: #eff6ff; border-radius: 10px; padding: 1.5rem; text-align: center; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 0.5rem; transition: all 0.2s; }
    .file-drop-area:hover { background: #dbeafe; border-color: #2563eb; transform: translateY(-1px); }
    .selected-file-info { display: flex; flex-direction: column; align-items: center; gap: 0.2rem; }
    .import-summary-card { background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 0.85rem; }

    /* Modal Backdrop & Shared Form Styles */
    .modal-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(15, 23, 42, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      backdrop-filter: blur(2px);
    }
    .modal-box {
      background: #ffffff;
      border-radius: 12px;
      padding: 24px;
      max-width: 520px;
      width: 90%;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2);
    }
    .modal-title { font-size: 18px; font-weight: 800; color: #0f172a; }
    .modal-desc { font-size: 13px; color: #64748b; margin: 4px 0 14px 0; }
    .delete-warning-box {
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 8px;
      padding: 12px;
      color: #991b1b;
      font-size: 13px;
      margin: 12px 0;
    }
    .form-stack { display: flex; flex-direction: column; gap: 14px; }
    .two-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .label { font-size: 12px; font-weight: 700; color: #475569; margin-bottom: 4px; display: block; }
    .input {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      font-size: 13px;
      background: #ffffff;
      box-sizing: border-box;
    }
    .input:focus {
      outline: none;
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
    }
  `]
})
export class CaptureComponent implements OnInit {
  sessions = signal<InventorySessionSummary[]>([]);
  shelves = signal<ShelfAssignmentDto[]>([]);
  selectedSessionId = signal<number>(0);
  selectedShelfId = signal<number>(0);

  // Rows of the current cédula
  rows = signal<SheetRow[]>([]);
  saving = signal<boolean>(false);
  hasUnsavedChanges = signal<boolean>(false);

  // Shelf editing state
  editingShelf: { id: number; code: string; zone: string; description: string; plant: string } | null = null;
  savingShelf = signal(false);

  // Shelf clear state
  showClearShelfModal = false;
  clearingShelf = signal(false);

  // Active focus in cell
  activeRowIndex: number = -1;
  activeCellType: 'code' | 'qty' | null = null;
  currentSuggestions = signal<SuggestionItem[]>([]);

  // Search subject for catalog lookups
  private searchSubject = new Subject<{ index: number; term: string }>();

  // Modals
  showPasteModal = false;
  pasteContent = '';
  showCreateSessionModal = false;
  newSessionTitle = '';
  newSessionWarehouse = '1';
  newSessionNotes = '';
  showReopenModal = false;
  reopenReason = '';
  showImportExcelModal = false;
  selectedExcelFile: File | null = null;
  importTargetShelfId = signal<number>(0);
  importingExcel = signal<boolean>(false);
  importResult: { importedRecords: number; totalPieces: number; shelvesUpdated: number; affectedShelves?: string[] } | null = null;

  quickChips: string[] = [];
  learnedCount = computed(() => this.patternSuggester.getLearnedChipsCount());

  // Computed properties
  currentSession = computed(() => this.sessions().find(s => s.id === this.selectedSessionId()));
  currentShelf = computed(() => this.shelves().find(sh => sh.shelfId === this.selectedShelfId()));

  isEditable = computed(() => {
    const s = this.currentSession();
    if (!s) return false;
    return s.status === 'EN_CONTEO' || s.status === 'BORRADOR' || s.status === 'REABIERTO';
  });

  validRowCount = computed(() => this.rows().filter(r => r.code && r.code.trim().length > 0).length);

  totalPieces = computed(() => {
    return this.rows().reduce((sum, r) => sum + (r.quantity || 0), 0);
  });

  duplicateCount = computed(() => {
    return this.rows().filter(r => r.isDuplicate).length;
  });

  activeRowSimilarAlert = computed(() => {
    const idx = this.activeRowIndex;
    const list = this.rows();
    if (idx >= 0 && idx < list.length) {
      return list[idx].similarAlert;
    }
    return undefined;
  });

  applySimilarCode(code: string) {
    if (this.activeRowIndex >= 0 && this.activeRowIndex < this.rows().length) {
      const row = this.rows()[this.activeRowIndex];
      row.code = code;
      row.similarAlert = undefined;
      this.hasUnsavedChanges.set(true);
      this.recalculateDuplicates();
      this.toast.success(`Código actualizado a ${code}`);
    }
  }

  constructor(
    private api: ApiService,
    public auth: AuthService,
    private toast: ToastService,
    private route: ActivatedRoute,
    private patternSuggester: PatternSuggesterService
  ) {
    this.quickChips = this.patternSuggester.getQuickChips();

    // Debounced catalog search
    this.searchSubject.pipe(
      debounceTime(180),
      distinctUntilChanged((a, b) => a.term === b.term),
      switchMap(req => {
        if (!req.term || req.term.length < 2) return of({ index: req.index, products: [] as ProductDto[] });
        return this.api.searchProducts(req.term).pipe(
          switchMap(products => of({ index: req.index, products }))
        );
      })
    ).subscribe(({ index, products }) => {
      if (this.activeRowIndex === index) {
        const term = this.rows()[index]?.code || '';
        const patternItems = this.patternSuggester.suggest(term, 6);
        const catalogItems: SuggestionItem[] = products.slice(0, 6).map(p => ({
          code: p.code,
          description: p.description,
          source: 'CATALOGO'
        }));

        const merged: SuggestionItem[] = [];
        const seen = new Set<string>();
        [...catalogItems, ...patternItems].forEach(item => {
          if (!seen.has(item.code.toUpperCase())) {
            seen.add(item.code.toUpperCase());
            merged.push(item);
          }
        });

        this.currentSuggestions.set(merged);
      }
    });
  }

  ngOnInit() {
    this.loadSessions();
  }

  loadSessions() {
    this.api.getSessions().subscribe({
      next: (data) => {
        this.sessions.set(data);
        if (data.length > 0) {
          this.route.queryParams.subscribe(params => {
            const requestedSessionId = params['sessionId'] ? Number(params['sessionId']) : data[0].id;
            const requestedShelfId = params['shelfId'] ? Number(params['shelfId']) : 0;
            this.selectedSessionId.set(requestedSessionId);
            this.loadShelvesForSession(requestedSessionId, requestedShelfId);
          });
        }
      },
      error: (err) => this.toast.error('Error al cargar inventarios: ' + (err.error?.message || err.message))
    });
  }

  loadShelvesForSession(sessionId: number, targetShelfId = 0) {
    this.api.getSessionShelves(sessionId).subscribe({
      next: (shs) => {
        this.shelves.set(shs);
        if (targetShelfId > 0 && shs.some(s => s.shelfId === targetShelfId)) {
          this.selectedShelfId.set(targetShelfId);
          this.loadShelfCounts(sessionId, targetShelfId);
        } else if (shs.length > 0 && this.selectedShelfId() === 0) {
          this.selectedShelfId.set(shs[0].shelfId);
          this.loadShelfCounts(sessionId, shs[0].shelfId);
        }
      },
      error: (err) => this.toast.error('Error al cargar anaqueles: ' + (err.error?.message || err.message))
    });
  }

  onSessionChange(newSessionId: number) {
    this.selectedSessionId.set(Number(newSessionId));
    this.loadShelvesForSession(Number(newSessionId));
  }

  onShelfChange(newShelfId: number) {
    const shelfId = Number(newShelfId);
    this.selectedShelfId.set(shelfId);
    if (shelfId > 0) {
      this.loadShelfCounts(this.selectedSessionId(), shelfId);
    } else {
      this.rows.set([]);
    }
  }

  openEditCurrentShelfModal() {
    const sh = this.currentShelf();
    if (!sh) return;
    this.editingShelf = {
      id: sh.shelfId,
      code: sh.shelfCode,
      zone: sh.shelfZone || '',
      description: sh.shelfDescription || '',
      plant: sh.plant || 'Planta Baja'
    };
  }

  saveCurrentShelfEdit() {
    if (!this.editingShelf) return;
    const target = this.editingShelf;
    if (!target.code.trim()) {
      this.toast.warning('El código de anaquel no puede estar vacío');
      return;
    }
    this.savingShelf.set(true);
    this.api.updateShelf(target.id, {
      code: target.code.trim().toUpperCase(),
      zone: target.zone.trim(),
      description: target.description.trim(),
      plant: target.plant
    }).subscribe({
      next: (updated) => {
        this.savingShelf.set(false);
        this.toast.success(`Anaquel ${updated.code} actualizado`);
        this.shelves.update(list => list.map(s => {
          if (s.shelfId === target.id) {
            return {
              ...s,
              shelfCode: updated.code,
              shelfZone: updated.zone,
              shelfDescription: updated.description,
              plant: updated.plant
            };
          }
          return s;
        }));
        this.editingShelf = null;
      },
      error: (err) => {
        this.savingShelf.set(false);
        this.toast.error(err.error?.message || 'Error al actualizar anaquel');
      }
    });
  }

  async downloadCurrentShelfQrPng() {
    const sh = this.currentShelf();
    if (!sh) return;
    try {
      const captureUrl = `${window.location.origin}/capture?sessionId=${this.selectedSessionId()}&shelfId=${sh.shelfId}`;
      const qrDataUrl = await QRCode.toDataURL(captureUrl, {
        width: 800,
        margin: 2,
        errorCorrectionLevel: 'H',
        color: { dark: '#0a2472', light: '#ffffff' }
      });
      const a = document.createElement('a');
      a.href = qrDataUrl;
      a.download = `${sh.shelfCode}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      this.toast.success(`Código QR de ${sh.shelfCode} descargado como ${sh.shelfCode}.png`);
    } catch (e: any) {
      this.toast.error('Error al generar código QR: ' + e.message);
    }
  }

  openClearCurrentShelfModal() {
    if (!this.currentShelf()) return;
    this.showClearShelfModal = true;
  }

  executeClearCurrentShelf() {
    const sh = this.currentShelf();
    if (!sh) return;
    this.clearingShelf.set(true);
    this.api.resetShelfAssignment(this.selectedSessionId(), sh.shelfId, true).subscribe({
      next: () => {
        this.clearingShelf.set(false);
        this.showClearShelfModal = false;
        this.toast.success(`Conteos del anaquel ${sh.shelfCode} eliminados y restablecido a Pendiente.`);
        this.rows.set([]);
        this.hasUnsavedChanges.set(false);
        this.loadShelvesForSession(this.selectedSessionId(), sh.shelfId);
      },
      error: (err) => {
        this.clearingShelf.set(false);
        this.toast.error(err.error?.message || 'Error al limpiar conteos del anaquel');
      }
    });
  }

  loadShelfCounts(sessionId: number, shelfId: number) {
    this.api.getCounts(sessionId, shelfId).subscribe({
      next: (records) => {
        const loadedRows: SheetRow[] = records.map((r, i) => ({
          id: r.id,
          tempId: 'row_' + r.id + '_' + i,
          code: r.capturedCode,
          quantity: r.quantity,
          unit: r.unit || 'PZA',
          inCatalog: r.existsInCatalog,
          notes: r.notes,
          isNew: false
        }));

        this.patternSuggester.learnFromMaterials(loadedRows.map(r => r.code));
        this.quickChips = this.patternSuggester.getQuickChips();

        if (loadedRows.length === 0) {
          for (let i = 0; i < 6; i++) {
            loadedRows.push(this.createEmptyRow());
          }
        } else {
          loadedRows.push(this.createEmptyRow());
        }

        this.rows.set(loadedRows);
        this.recalculateDuplicates();
        this.hasUnsavedChanges.set(false);
      },
      error: (err) => this.toast.error('Error al cargar conteos: ' + (err.error?.message || err.message))
    });
  }

  createEmptyRow(): SheetRow {
    return {
      tempId: 'temp_' + Math.random().toString(36).substring(2, 9),
      code: '',
      quantity: null,
      unit: 'PZA',
      inCatalog: false,
      isNew: true
    };
  }

  onCellFocus(rowIndex: number, cellType: 'code' | 'qty') {
    this.activeRowIndex = rowIndex;
    this.activeCellType = cellType;
    if (cellType === 'code') {
      const term = this.rows()[rowIndex]?.code || '';
      if (term.length > 0) {
        this.currentSuggestions.set(this.patternSuggester.suggest(term, 8));
      } else {
        this.currentSuggestions.set([]);
      }
    } else {
      this.currentSuggestions.set([]);
    }
  }

  onCodeInput(index: number, val: string) {
    this.hasUnsavedChanges.set(true);
    const row = this.rows()[index];
    row.code = val.toUpperCase();

    this.searchSubject.next({ index, term: row.code });
    this.recalculateDuplicates();
  }

  onQuantityChange(index: number) {
    this.hasUnsavedChanges.set(true);
    this.recalculateDuplicates();
  }

  selectSuggestion(index: number, sugg: SuggestionItem) {
    const row = this.rows()[index];
    row.code = sugg.code;
    row.inCatalog = sugg.source === 'CATALOGO';
    this.patternSuggester.learn(sugg.code);
    this.currentSuggestions.set([]);
    this.hasUnsavedChanges.set(true);
    this.recalculateDuplicates();

    setTimeout(() => {
      const qtyInputs = document.querySelectorAll<HTMLInputElement>('.qty-input');
      if (qtyInputs[index]) {
        qtyInputs[index].focus();
        qtyInputs[index].select();
      }
    }, 40);
  }

  appendChipToActive(chip: string) {
    if (this.activeRowIndex < 0 || this.activeRowIndex >= this.rows().length) {
      if (this.rows().length > 0) this.activeRowIndex = 0;
      else return;
    }
    const row = this.rows()[this.activeRowIndex];
    if (!row.code) {
      row.code = chip;
    } else {
      row.code = (row.code + ' ' + chip).replace(/\s+/g, ' ');
    }
    this.hasUnsavedChanges.set(true);
    this.recalculateDuplicates();
    this.currentSuggestions.set(this.patternSuggester.suggest(row.code, 8));
  }

  onCodeKeyDown(event: KeyboardEvent, index: number) {
    if (event.key === 'Enter') {
      event.preventDefault();
      const suggs = this.currentSuggestions();
      if (suggs.length > 0 && !this.rows()[index].code.includes(' ')) {
        this.selectSuggestion(index, suggs[0]);
        return;
      }

      const qtyInputs = document.querySelectorAll<HTMLInputElement>('.qty-input');
      if (qtyInputs[index]) {
        qtyInputs[index].focus();
        qtyInputs[index].select();
      }
    } else if (event.key === 'ArrowDown') {
      const codeInputs = document.querySelectorAll<HTMLInputElement>('.cell-input-wrap .cell-input');
      if (codeInputs[index + 1]) {
        codeInputs[index + 1].focus();
      }
    } else if (event.key === 'ArrowUp') {
      const codeInputs = document.querySelectorAll<HTMLInputElement>('.cell-input-wrap .cell-input');
      if (codeInputs[index - 1]) {
        codeInputs[index - 1].focus();
      }
    }
  }

  onQtyKeyDown(event: KeyboardEvent, index: number) {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (index === this.rows().length - 1) {
        this.addRowAtEnd();
      }
      setTimeout(() => {
        const codeInputs = document.querySelectorAll<HTMLInputElement>('.cell-input-wrap .cell-input');
        if (codeInputs[index + 1]) {
          codeInputs[index + 1].focus();
        }
      }, 30);
    } else if (event.key === 'ArrowDown') {
      const qtyInputs = document.querySelectorAll<HTMLInputElement>('.qty-input');
      if (qtyInputs[index + 1]) {
        qtyInputs[index + 1].focus();
      }
    } else if (event.key === 'ArrowUp') {
      const qtyInputs = document.querySelectorAll<HTMLInputElement>('.qty-input');
      if (qtyInputs[index - 1]) {
        qtyInputs[index - 1].focus();
      }
    }
  }

  /**
   * Inserts an intermediate row ("en media celda") exactly below the specified index
   */
  insertRowBelow(index: number) {
    const list = [...this.rows()];
    const newRow = this.createEmptyRow();
    list.splice(index + 1, 0, newRow);
    this.rows.set(list);
    this.hasUnsavedChanges.set(true);
    this.recalculateDuplicates();

    setTimeout(() => {
      const codeInputs = document.querySelectorAll<HTMLInputElement>('.cell-input-wrap .cell-input');
      if (codeInputs[index + 1]) {
        codeInputs[index + 1].focus();
      }
    }, 40);
  }

  addRowAtEnd() {
    const list = [...this.rows(), this.createEmptyRow()];
    this.rows.set(list);
    this.hasUnsavedChanges.set(true);
  }

  deleteRow(index: number) {
    const list = [...this.rows()];
    list.splice(index, 1);
    if (list.length === 0) list.push(this.createEmptyRow());
    this.rows.set(list);
    this.hasUnsavedChanges.set(true);
    this.recalculateDuplicates();
  }

  clearRowCode(index: number) {
    const row = this.rows()[index];
    row.code = '';
    row.quantity = null;
    this.hasUnsavedChanges.set(true);
    this.recalculateDuplicates();
  }

  removeEmptyRows() {
    const list = this.rows().filter(r => r.code && r.code.trim().length > 0);
    list.push(this.createEmptyRow());
    this.rows.set(list);
    this.hasUnsavedChanges.set(true);
    this.recalculateDuplicates();
  }

  recalculateDuplicates() {
    const list = this.rows();
    const map = new Map<string, number[]>();

    list.forEach((r, idx) => {
      const clean = r.code ? r.code.trim().toUpperCase() : '';
      if (clean) {
        if (!map.has(clean)) map.set(clean, []);
        map.get(clean)!.push(idx);
      }
    });

    const allSheetCodes = list.map(r => r.code ? r.code.trim().toUpperCase() : '').filter(c => c.length >= 2);

    list.forEach((r, idx) => {
      const clean = r.code ? r.code.trim().toUpperCase() : '';
      if (clean && map.has(clean) && map.get(clean)!.length > 1) {
        r.isDuplicate = true;
        const otherIndices = map.get(clean)!.filter(i => i !== idx).map(i => `Fila ${i + 1}`);
        r.duplicateInfo = otherIndices.join(', ');
        r.similarAlert = undefined;
      } else {
        r.isDuplicate = false;
        r.duplicateInfo = undefined;

        // Check similar codes (only if not an exact duplicate and not in catalog)
        if (clean.length >= 3 && !r.inCatalog && r.isNew) {
          const otherCodes = allSheetCodes.filter((_, i) => i !== idx);
          const alerts = this.patternSuggester.detectSimilarCodes(clean, otherCodes);
          r.similarAlert = alerts.length > 0 ? alerts[0] : undefined;
        } else {
          r.similarAlert = undefined;
        }
      }
    });
  }

  consolidateDuplicates() {
    const list = this.rows();
    const map = new Map<string, SheetRow>();

    for (const r of list) {
      const clean = r.code ? r.code.trim().toUpperCase() : '';
      if (!clean) continue;

      if (!map.has(clean)) {
        map.set(clean, { ...r, quantity: r.quantity || 0 });
      } else {
        const existing = map.get(clean)!;
        existing.quantity = (existing.quantity || 0) + (r.quantity || 0);
      }
    }

    const consolidated = Array.from(map.values());
    consolidated.push(this.createEmptyRow());
    this.rows.set(consolidated);
    this.recalculateDuplicates();
    this.hasUnsavedChanges.set(true);
    this.toast.success('Códigos duplicados sumados y consolidados.');
  }

  saveEntireSheet() {
    if (this.selectedShelfId() === 0) {
      this.toast.error('Selecciona un anaquel para guardar.');
      return;
    }

    const validRows = this.rows().filter(r => r.code && r.code.trim().length > 0);
    if (validRows.length === 0) {
      this.toast.error('No hay códigos válidos para guardar.');
      return;
    }

    this.saving.set(true);

    const payload = {
      sessionId: this.selectedSessionId(),
      shelfId: this.selectedShelfId(),
      rows: validRows.map(r => ({
        id: r.id,
        code: r.code.trim().toUpperCase(),
        quantity: r.quantity !== null && r.quantity !== undefined ? Number(r.quantity) : 0,
        notes: r.notes
      }))
    };

    this.api.batchSaveSheet(payload).subscribe({
      next: (savedRecords) => {
        this.saving.set(false);
        this.hasUnsavedChanges.set(false);
        this.toast.success(`Cédula guardada con éxito: ${savedRecords.length} partidas registradas.`);
        const newlyLearned = this.patternSuggester.learnFromMaterials(savedRecords.map(s => s.capturedCode));
        this.quickChips = this.patternSuggester.getQuickChips();
        if (newlyLearned > 0) {
          this.toast.info(`Sistema autodidacta: ${newlyLearned} atajo(s)/medida(s) nuevas aprendidas de esta captura.`);
        }
        this.loadShelfCounts(this.selectedSessionId(), this.selectedShelfId());
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error('Error al guardar la cédula: ' + (err.error?.message || err.message));
      }
    });
  }

  onTablePaste(event: ClipboardEvent) {
    const text = event.clipboardData?.getData('text');
    if (text && (text.includes('\t') || text.includes('\n'))) {
      event.preventDefault();
      this.parseAndInsertPastedRows(text);
    }
  }

  openPasteModal() {
    this.pasteContent = '';
    this.showPasteModal = true;
  }

  processPastedData() {
    if (!this.pasteContent.trim()) {
      this.showPasteModal = false;
      return;
    }
    this.parseAndInsertPastedRows(this.pasteContent);
    this.showPasteModal = false;
  }

  parseAndInsertPastedRows(rawText: string) {
    const lines = rawText.split(/\r?\n/).filter(l => l.trim().length > 0);
    const newItems: SheetRow[] = [];

    let codeCol = -1;
    let qtyCol = -1;

    for (const line of lines) {
      const parts = (line.includes('\t') ? line.split('\t') : line.split(/[,;]/))
        .map(p => p.trim());
      if (parts.length === 0 || parts.every(p => p.length === 0)) continue;

      // Header detection:
      let isHeader = false;
      for (let c = 0; c < parts.length; c++) {
        const cu = parts[c].toUpperCase();
        if ((cu.includes('CVE') || cu.includes('COD') || cu.includes('ART') || cu.includes('CLAVE')) && !cu.includes('ESQ')) {
          isHeader = true;
          codeCol = c;
        }
        if (cu.includes('CANT') || cu.includes('PIEZA') || cu.includes('QTY') || cu.includes('TOTAL') || cu.includes('FISIC') || cu.includes('FÍSIC') || cu.includes('EXISTENCIA')) {
          isHeader = true;
          qtyCol = c;
        }
      }
      if (isHeader) continue; // Skip header line!

      // If columns not determined from header, detect by structure:
      let cCol = codeCol;
      let qCol = qtyCol;

      if (cCol < 0 || qCol < 0) {
        if (parts.length >= 5 && (parts[0].toUpperCase() === 'A' || parts[1].toUpperCase() === 'P')) {
          // Aspel SAE 5-column format: ESTATUS, TIPO, CLAVE, ESQ, EXISTENCIA FÍSICA
          cCol = 2;
          qCol = 4;
        } else if (parts.length >= 3) {
          cCol = 0;
          qCol = 2;
        } else if (parts.length === 2) {
          cCol = 0;
          qCol = 1;
        } else {
          cCol = 0;
          qCol = -1;
        }
      }

      if (cCol >= parts.length) continue;
      const code = parts[cCol]?.trim().toUpperCase().replace(/["']/g, '');
      if (!code) continue;

      // Filter out header words that might slip through
      if (code === 'CLAVE' || code === 'CVE' || code === 'CVE_ART' || code === 'CODIGO' || code === 'ESTATUS' || code.includes('TIPO DE ELEMENTO')) {
        continue;
      }

      let qty = 1;
      if (qCol >= 0 && qCol < parts.length && parts[qCol]) {
        const parsed = parseFloat(parts[qCol].replace(/[^0-9.]/g, ''));
        if (!isNaN(parsed)) qty = parsed;
      }

      newItems.push({
        tempId: 'paste_' + Math.random().toString(36).substring(2, 9),
        code,
        quantity: qty,
        unit: 'PZA',
        inCatalog: true,
        isNew: true
      });
    }

    if (newItems.length > 0) {
      const existing = this.rows().filter(r => r.code && r.code.trim().length > 0);
      this.rows.set([...existing, ...newItems, this.createEmptyRow()]);
      this.recalculateDuplicates();
      this.hasUnsavedChanges.set(true);
      this.patternSuggester.learnBulk(newItems.map(i => i.code));
      this.toast.success(`Se insertaron ${newItems.length} renglones de Excel correctamente.`);
    }
  }

  /**
   * Export only the current selected shelf for Aspel SAE
   */
  exportCurrentShelf(format: 'CSV' | 'TXT') {
    if (this.selectedShelfId() === 0) return;
    this.api.downloadSaeExport(this.selectedSessionId(), format, 'IMPORT', this.selectedShelfId()).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `SAE_ANAQUEL_${this.currentShelf()?.shelfCode || 'GENERAL'}.${format.toLowerCase()}`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.toast.success(`Archivo de anaquel ${this.currentShelf()?.shelfCode} generado para SAE.`);
      },
      error: (err) => this.toast.error('Error al exportar anaquel: ' + (err.error?.message || err.message))
    });
  }

  /**
   * Export all shelves consolidated in one master file for Aspel SAE PIs (Partidas de Inventario)
   */
  exportGlobalConsolidated(format: 'CSV' | 'TXT') {
    if (this.selectedSessionId() === 0) return;
    this.api.downloadSaeExport(this.selectedSessionId(), format, 'IMPORT').subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `SAE_CONSOLIDADO_GLOBAL_${this.currentSession()?.folio || 'INVENTARIO'}.${format.toLowerCase()}`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.toast.success(`Archivo Consolidado Global descargado (listo para Partidas de Inventario en SAE).`);
      },
      error: (err) => this.toast.error('Error al exportar consolidado: ' + (err.error?.message || err.message))
    });
  }

  markAsSuccess() {
    if (this.hasUnsavedChanges()) {
      this.toast.warning('Primero guarda la cédula antes de marcar como éxito.');
      return;
    }
    const sessionId = this.selectedSessionId();
    this.api.updateSessionStatus(sessionId, 'CERRADO_EXITO', 'Conteo finalizado y validado para importación SAE').subscribe({
      next: () => {
        this.toast.success('Cédula cerrada y protegida CON ÉXITO para Aspel SAE.');
        this.loadSessions();
      },
      error: (err) => this.toast.error('Error al marcar éxito: ' + (err.error?.message || err.message))
    });
  }

  markAsPendingReview() {
    const sessionId = this.selectedSessionId();
    this.api.updateSessionStatus(sessionId, 'POR_VALIDAR', 'En revisión técnica').subscribe({
      next: () => {
        this.toast.info('Cédula marcada PENDIENTE DE REVISIÓN.');
        this.loadSessions();
      },
      error: (err) => this.toast.error('Error: ' + (err.error?.message || err.message))
    });
  }

  openReopenModal() {
    this.reopenReason = '';
    this.showReopenModal = true;
  }

  submitReopenSession() {
    if (!this.reopenReason || this.reopenReason.trim().length < 4) {
      this.toast.error('Ingresa un motivo para reabrir la cédula.');
      return;
    }
    const sessionId = this.selectedSessionId();
    this.api.reopenSession(sessionId, this.reopenReason).subscribe({
      next: () => {
        this.showReopenModal = false;
        this.toast.success('Cédula reabierta con éxito. Lista de materiales desbloqueada.');
        this.loadSessions();
        if (this.selectedShelfId() > 0) {
          this.loadShelfCounts(sessionId, this.selectedShelfId());
        }
      },
      error: (err) => this.toast.error('Error al reabrir: ' + (err.error?.message || err.message))
    });
  }

  openCreateSessionModal() {
    this.newSessionTitle = '';
    this.newSessionWarehouse = '1';
    this.newSessionNotes = '';
    this.showCreateSessionModal = true;
  }

  submitCreateSession() {
    if (!this.newSessionTitle.trim()) {
      this.toast.error('Ingresa un título para el inventario.');
      return;
    }
    this.api.createSession({
      title: this.newSessionTitle,
      warehouseCode: this.newSessionWarehouse,
      notes: this.newSessionNotes
    }).subscribe({
      next: (created) => {
        this.showCreateSessionModal = false;
        this.toast.success(`Folio ${created.folio} creado con éxito.`);
        this.loadSessions();
      },
      error: (err) => this.toast.error('Error al crear sesión: ' + (err.error?.message || err.message))
    });
  }

  openImportExcelModal() {
    this.selectedExcelFile = null;
    this.importResult = null;
    this.importTargetShelfId.set(this.selectedShelfId() > 0 ? this.selectedShelfId() : 0);
    this.showImportExcelModal = true;
  }

  closeImportExcelModal() {
    this.showImportExcelModal = false;
    this.selectedExcelFile = null;
  }

  onFileSelectedForImport(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedExcelFile = input.files[0];
      this.importResult = null;
    }
  }

  submitImportExcel() {
    if (!this.selectedExcelFile) {
      this.toast.error('Selecciona un archivo Excel (.xlsx o .csv).');
      return;
    }
    const sessionId = this.selectedSessionId();
    if (!sessionId || sessionId === 0) {
      this.toast.error('Selecciona o crea una sesión de inventario primero.');
      return;
    }

    const shelfParam = this.importTargetShelfId() > 0 ? this.importTargetShelfId() : undefined;
    this.importingExcel.set(true);
    this.api.importExcelCounts(sessionId, this.selectedExcelFile, shelfParam).subscribe({
      next: (res) => {
        this.importingExcel.set(false);
        this.importResult = res;
        this.toast.success(`¡Éxito! ${res.importedRecords} partidas (${res.totalPieces} pzas) importadas en ${res.shelvesUpdated} anaqueles.`);
        this.loadShelvesForSession(sessionId, this.selectedShelfId());
        if (this.selectedShelfId() > 0) {
          this.loadShelfCounts(sessionId, this.selectedShelfId());
        }
      },
      error: (err) => {
        this.importingExcel.set(false);
        this.toast.error('Error al importar Excel: ' + (err.error?.message || err.message));
      }
    });
  }

  currentStatusClass(): string {
    const status = this.currentSession()?.status;
    if (status === 'CERRADO_EXITO') return 'status-exito';
    if (status === 'POR_VALIDAR') return 'status-revision';
    if (status === 'REABIERTO') return 'status-reabierto';
    return 'status-conteo';
  }

  currentStatusLabel(): string {
    const status = this.currentSession()?.status;
    if (status === 'CERRADO_EXITO') return 'Cerrado con Éxito SAE';
    if (status === 'POR_VALIDAR') return 'Pendiente en Revisión';
    if (status === 'REABIERTO') return 'Reabierto para Conteo';
    return 'En Conteo Físico';
  }
}
