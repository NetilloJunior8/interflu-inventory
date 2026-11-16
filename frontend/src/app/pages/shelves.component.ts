import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import * as QRCode from 'qrcode';
import { ApiService, ShelfAssignmentDto, InventorySessionSummary, UserSummary } from '../services/api.service';
import { ToastService } from '../services/toast.service';

@Component({
  selector: 'app-shelves',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">Administración de Anaqueles · Planta 1 y 2</h1>
        <p class="page-subtitle" *ngIf="session() as s">
          Inventario: <span class="mono fw-700">{{ s.folio }}</span> &bull; {{ s.title }}
        </p>
      </div>

      <div class="header-actions">
        <select class="select session-picker" [ngModel]="selectedSessionId()" (ngModelChange)="onSessionChange($event)">
          <option *ngFor="let s of sessions()" [value]="s.id">{{ s.folio }} — {{ s.title }}</option>
        </select>
        <a routerLink="/croquis" [queryParams]="{sessionId: selectedSessionId()}" class="btn btn-secondary">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
          Ver en Croquis
        </a>
        <button class="btn btn-primary" (click)="showNewShelfModal = true">+ Crear Anaquel</button>
      </div>
    </div>

    <!-- Filter by Plant -->
    <div class="filter-bar">
      <div class="tabs">
        <button class="tab-btn" [class.active]="filterPlant() === 'ALL'" (click)="setPlantFilter('ALL')">
          Todos ({{ shelves().length }})
        </button>
        <button class="tab-btn" [class.active]="filterPlant() === 'Planta Baja'" (click)="setPlantFilter('Planta Baja')">
          Planta Baja ({{ countPlant('Planta Baja') }})
        </button>
        <button class="tab-btn" [class.active]="filterPlant() === 'Planta Alta'" (click)="setPlantFilter('Planta Alta')">
          Planta Alta ({{ countPlant('Planta Alta') }})
        </button>
      </div>
    </div>

    <!-- Shelves Grid -->
    <div class="shelves-grid">
      <div class="shelf-card" *ngFor="let s of filteredShelves()">
        <div class="shelf-card-header">
          <div>
            <div class="shelf-plant-badge">{{ s.plant || 'Planta 1' }}</div>
            <span class="mono shelf-code">{{ s.shelfCode }}</span>
            <span class="shelf-zone">{{ s.shelfZone }}</span>
          </div>
          <span class="badge" [ngClass]="shelfStatusClass(s.status)">{{ s.status }}</span>
        </div>

        <p class="shelf-desc" *ngIf="s.shelfDescription">{{ s.shelfDescription }}</p>

        <div class="shelf-metrics">
          <div class="metric">
            <span class="m-val mono">{{ s.totalPieces | number:'1.0-2' }}</span>
            <span class="m-lbl">Piezas</span>
          </div>
          <div class="metric">
            <span class="m-val">{{ s.recordCount }}</span>
            <span class="m-lbl">Artículos</span>
          </div>
        </div>

        <div class="shelf-assignment">
          <label class="label-xs">Responsable:</label>
          <div class="worker-select-wrap">
            <select class="select select-sm" [ngModel]="s.assignedUserId || null" (ngModelChange)="assignWorker(s, $event)">
              <option [ngValue]="null">-- Por Asignar --</option>
              <option *ngFor="let u of workers()" [ngValue]="u.id">{{ u.fullName }}</option>
            </select>
          </div>
        </div>

        <div class="shelf-actions">
          <a routerLink="/capture" [queryParams]="{sessionId: selectedSessionId(), shelfId: s.shelfId}" class="btn btn-accent btn-sm flex-1">
            Capturar
          </a>
          <button class="btn btn-outline btn-sm" (click)="downloadShelfQr(s)" title="Descargar código QR puro en PNG">
            QR (.png)
          </button>
          <button
            *ngIf="(s.totalPieces || 0) > 0 || (s.recordCount || 0) > 0"
            class="btn btn-outline btn-sm"
            (click)="downloadShelfMaterialsZip(s)"
            title="Descargar todos los códigos QR de materiales de este anaquel en archivo ZIP con nombres individuales como CODIGO.png"
          >
            QRs (.zip)
          </button>
          <button class="btn btn-secondary btn-sm" (click)="openEditShelf(s)" title="Editar código, zona o sector">
            Editar
          </button>
          <button
            *ngIf="(s.totalPieces || 0) > 0 || (s.recordCount || 0) > 0"
            class="btn btn-outline-danger btn-sm"
            (click)="openClearShelfCountsModal(s)"
            title="Eliminar conteos únicamente de este anaquel"
          >
            Limpiar
          </button>
          <button class="btn btn-ghost btn-sm" (click)="toggleShelfStatus(s)">
            {{ s.status === 'COMPLETADO' ? 'Reabrir' : 'Completar' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Modal: Edit Shelf Details -->
    <div class="modal-backdrop" *ngIf="editingShelf" (click)="editingShelf = null">
      <div class="modal-box" (click)="$event.stopPropagation()">
        <div class="modal-header-row" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 10px; margin-bottom: 14px;">
          <h3 class="modal-title" style="margin: 0;">Editar Anaquel</h3>
          <button class="modal-close-icon-btn" (click)="editingShelf = null" title="Cerrar">✕</button>
        </div>
        <p class="modal-desc" style="font-size: 13px; color: var(--text-muted); margin: 0 0 14px 0;">Modifica el código, zona o sector físico de este anaquel.</p>
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
          <button class="btn btn-secondary" (click)="editingShelf = null" [disabled]="savingShelf()">Cancelar</button>
          <button class="btn btn-primary" (click)="saveShelfEdit()" [disabled]="savingShelf()">
            {{ savingShelf() ? 'Guardando...' : 'Guardar Cambios' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Modal: Confirm Clear Single Shelf Counts -->
    <div class="modal-backdrop" *ngIf="shelfToClearCounts" (click)="shelfToClearCounts = null">
      <div class="modal-box" (click)="$event.stopPropagation()">
        <h3 class="modal-title text-danger" style="margin-top: 0;">Limpiar Conteos del Anaquel</h3>
        <p class="modal-desc" style="font-size: 13px; color: var(--text-muted); margin: 0 0 14px 0;">
          ¿Deseas eliminar todas las partidas contabilizadas en el anaquel <strong class="mono">{{ shelfToClearCounts.shelfCode }}</strong>?
        </p>
        <div class="delete-warning-box">
          <strong>Restablecimiento individual:</strong>
          <ul style="margin: 6px 0 0 16px; padding: 0;">
            <li>Se eliminarán las {{ shelfToClearCounts.recordCount || 0 }} partidas contadas ({{ shelfToClearCounts.totalPieces | number:'1.0-2' }} piezas) de este anaquel.</li>
            <li>El anaquel regresará a estado <strong>PENDIENTE</strong> con 0 piezas en el croquis y en el inventario.</li>
            <li>Los demás anaqueles del almacén <strong>no serán afectados</strong>.</li>
          </ul>
        </div>
        <div class="modal-footer" style="margin-top: 18px;">
          <button class="btn btn-secondary" (click)="shelfToClearCounts = null" [disabled]="clearingShelfCounts()">Cancelar</button>
          <button class="btn btn-danger" (click)="executeClearShelfCounts()" [disabled]="clearingShelfCounts()">
            {{ clearingShelfCounts() ? 'Limpiando...' : 'Sí, Limpiar Este Anaquel' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Modal: New Shelf -->
    <div class="modal-backdrop" *ngIf="showNewShelfModal" (click)="showNewShelfModal = false">
      <div class="modal-box" (click)="$event.stopPropagation()">
        <div class="modal-header-row" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 10px; margin-bottom: 12px;">
          <h3 class="modal-title" style="margin: 0;">Nuevo Anaquel o Ubicación Física</h3>
          <button class="modal-close-icon-btn" (click)="showNewShelfModal = false" title="Cerrar">✕</button>
        </div>
        <div class="form-stack">
          <div class="two-cols">
            <div>
              <label class="label">Código de Anaquel</label>
              <input class="input mono" [(ngModel)]="newShelf.code" placeholder="Ej. P1-VAL-03, P2-EST-01" />
            </div>
            <div>
              <label class="label">Planta de Almacén</label>
              <select class="select" [(ngModel)]="newShelf.plant">
                <option value="Planta Baja">Planta Baja</option>
                <option value="Planta Alta">Planta Alta</option>
              </select>
            </div>
          </div>
          <div>
            <button type="button" class="btn btn-sm btn-outline mb-2" (click)="generateGenericCode()">
              + Auto-Generar Código Genérico
            </button>
          </div>
          <div>
            <label class="label">Zona / Sector</label>
            <input class="input" [(ngModel)]="newShelf.zone" placeholder="Ej. Kuriyama, Sellos, PVC, Conexiones" />
          </div>
          <div>
            <label class="label">Descripción</label>
            <input class="input" [(ngModel)]="newShelf.description" placeholder="Ej. Gaveta de coples rápidos y racores" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" (click)="showNewShelfModal = false">Cancelar</button>
          <button class="btn btn-primary" (click)="createShelf()">Guardar Anaquel</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .page-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
    .page-title { font-size: 20px; font-weight: 700; color: var(--text-primary); margin: 0 0 4px 0; }
    .page-subtitle { margin: 0; color: var(--text-muted); font-size: 13px; }
    .header-actions { display: flex; gap: 10px; align-items: center; }
    .session-picker { width: 230px; }

    .filter-bar { margin-bottom: 18px; }
    .tabs { display: flex; gap: 6px; }
    .tab-btn {
      background: #ffffff;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 7px 16px;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-secondary);
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .tab-btn:hover {
      background: #f8fafc;
      transform: translateY(-1px);
    }
    .tab-btn.active {
      background: var(--brand-navy);
      color: #ffffff;
      border-color: var(--brand-navy);
      box-shadow: 0 3px 10px rgba(10, 36, 114, 0.22);
      transform: scale(1.02);
    }

    .shelves-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
      animation: tabSweep 0.22s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes tabSweep {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .shelf-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      box-shadow: var(--shadow-sm);
      transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease;
    }
    .shelf-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 24px -4px rgba(15, 23, 42, 0.12);
    }
    .shelf-card-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
    .shelf-plant-badge { font-size: 10px; font-weight: 700; color: var(--brand-blue); text-transform: uppercase; margin-bottom: 2px; }
    .shelf-code { font-size: 16px; font-weight: 700; color: var(--brand-navy); display: block; }
    .shelf-zone { font-size: 12px; color: var(--text-muted); }
    .shelf-desc { font-size: 12px; color: var(--text-secondary); margin: 0; }

    .shelf-metrics { display: grid; grid-template-columns: 1fr 1fr; background: var(--bg-subtle); border-radius: var(--radius-sm); padding: 8px 12px; text-align: center; }
    .metric { display: flex; flex-direction: column; }
    .m-val { font-size: 17px; font-weight: 700; color: var(--text-primary); }
    .m-lbl { font-size: 10.5px; color: var(--text-muted); text-transform: uppercase; }

    .shelf-assignment { display: flex; flex-direction: column; gap: 4px; }
    .label-xs { font-size: 10.5px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; }

    .shelf-actions { display: flex; gap: 8px; margin-top: auto; padding-top: 8px; border-top: 1px solid var(--border-color); }
    .flex-1 { flex: 1; }

    .modal-title { margin: 0 0 16px 0; font-size: 18px; font-weight: 700; color: var(--brand-navy); }
    .form-stack { display: flex; flex-direction: column; gap: 14px; }
    .two-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .modal-footer { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
    .delete-warning-box {
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 8px;
      padding: 12px;
      color: #991b1b;
      font-size: 13px;
      margin: 12px 0;
    }
  `]
})
export class ShelvesComponent implements OnInit {
  sessions = signal<InventorySessionSummary[]>([]);
  selectedSessionId = signal<number>(0);
  session = signal<InventorySessionSummary | null>(null);
  shelves = signal<ShelfAssignmentDto[]>([]);
  workers = signal<UserSummary[]>([]);
  filterPlant = signal<'ALL' | 'Planta Baja' | 'Planta Alta'>('ALL');

  // Shelf editing state
  editingShelf: { id: number; code: string; zone: string; description: string; plant: string } | null = null;
  savingShelf = signal(false);

  // Clear single shelf state
  shelfToClearCounts: ShelfAssignmentDto | null = null;
  clearingShelfCounts = signal(false);

  countPlant(p: 'Planta Baja' | 'Planta Alta'): number {
    return this.shelves().filter(s => {
      const pl = s.plant || '';
      if (p === 'Planta Baja') return pl === 'Planta Baja' || pl === 'Planta 1';
      return pl === 'Planta Alta' || pl === 'Planta 2';
    }).length;
  }

  filteredShelves = computed(() => {
    const f = this.filterPlant();
    if (f === 'ALL') return this.shelves();
    return this.shelves().filter(s => {
      const pl = s.plant || '';
      if (f === 'Planta Baja') return pl === 'Planta Baja' || pl === 'Planta 1';
      return pl === 'Planta Alta' || pl === 'Planta 2';
    });
  });

  showNewShelfModal = false;
  newShelf = { code: '', zone: '', description: '', warehouseCode: '1', plant: 'Planta Baja' };

  generateGenericCode() {
    const prefix = this.newShelf.plant === 'Planta Baja' ? 'PB-GEN-' : 'PA-GEN-';
    const num = String(this.shelves().length + 1).padStart(2, '0');
    this.newShelf.code = prefix + num;
    if (!this.newShelf.zone) this.newShelf.zone = 'Área General';
    if (!this.newShelf.description) this.newShelf.description = 'Anaquel Genérico ' + num;
  }

  constructor(
    private api: ApiService,
    private toast: ToastService,
    private route: ActivatedRoute
  ) {}

  setPlantFilter(p: 'ALL' | 'Planta Baja' | 'Planta Alta') {
    this.filterPlant.set(p);
    try { localStorage.setItem('interflu_shelves_plant', p); } catch (e) {}
  }

  ngOnInit() {
    try {
      const savedPlant = localStorage.getItem('interflu_shelves_plant');
      if (savedPlant === 'ALL' || savedPlant === 'Planta Baja' || savedPlant === 'Planta Alta') {
        this.filterPlant.set(savedPlant as any);
      }
    } catch (e) {}

    this.api.getUsers().subscribe(users => this.workers.set(users));

    this.api.getSessions().subscribe(sessions => {
      this.sessions.set(sessions);
      const queryId = Number(this.route.snapshot.queryParamMap.get('sessionId'));
      const savedId = Number(localStorage.getItem('interflu_active_session'));
      const activeId = queryId || savedId || sessions[0]?.id || 0;
      this.onSessionChange(activeId);
    });
  }

  onSessionChange(id: number) {
    this.selectedSessionId.set(id);
    localStorage.setItem('interflu_active_session', String(id));
    const s = this.sessions().find(x => x.id === id) || null;
    this.session.set(s);
    this.loadShelves(id);
  }

  loadShelves(sessionId: number) {
    if (!sessionId) return;
    this.api.getSessionShelves(sessionId).subscribe({
      next: (list) => this.shelves.set(list),
      error: () => this.toast.error('Error al cargar anaqueles')
    });
  }

  assignWorker(shelf: ShelfAssignmentDto, userId: number | null) {
    this.api.assignShelf(this.selectedSessionId(), shelf.shelfId, userId).subscribe({
      next: () => {
        this.toast.success(`Responsable asignado para ${shelf.shelfCode}`);
        this.loadShelves(this.selectedSessionId());
      },
      error: (err) => this.toast.error(err.error?.message || 'Error al asignar')
    });
  }

  toggleShelfStatus(s: ShelfAssignmentDto) {
    const nextStatus = s.status === 'COMPLETADO' ? 'EN_CONTEO' : 'COMPLETADO';
    this.api.updateShelfStatus(this.selectedSessionId(), s.shelfId, nextStatus).subscribe({
      next: () => {
        this.toast.success(`Anaquel ${s.shelfCode} marcado como ${nextStatus}`);
        this.loadShelves(this.selectedSessionId());
      },
      error: () => this.toast.error('Error al cambiar estado')
    });
  }

  createShelf() {
    if (!this.newShelf.code.trim()) {
      this.toast.warning('Ingresa el código del anaquel');
      return;
    }
    this.api.createShelf(this.newShelf).subscribe({
      next: (created) => {
        this.toast.success(`Anaquel ${created.code} creado`);
        this.showNewShelfModal = false;
        this.newShelf = { code: '', zone: '', description: '', warehouseCode: '1', plant: 'Planta 1' };
        this.loadShelves(this.selectedSessionId());
      },
      error: (err) => this.toast.error(err.error?.message || 'Error al crear anaquel')
    });
  }

  shelfStatusClass(status: string): string {
    switch (status) {
      case 'COMPLETADO': return 'badge-success';
      case 'EN_CONTEO': return 'badge-info';
      default: return 'badge-neutral';
    }
  }

  openEditShelf(shelf: ShelfAssignmentDto) {
    this.editingShelf = {
      id: shelf.shelfId,
      code: shelf.shelfCode,
      zone: shelf.shelfZone || '',
      description: shelf.shelfDescription || '',
      plant: shelf.plant || 'Planta Baja'
    };
  }

  saveShelfEdit() {
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

  async downloadShelfQr(shelf: ShelfAssignmentDto) {
    try {
      const captureUrl = `${window.location.origin}/capture?sessionId=${this.selectedSessionId()}&shelfId=${shelf.shelfId}`;
      const qrDataUrl = await QRCode.toDataURL(captureUrl, {
        width: 800,
        margin: 2,
        errorCorrectionLevel: 'H',
        color: { dark: '#0a2472', light: '#ffffff' }
      });
      const a = document.createElement('a');
      a.href = qrDataUrl;
      a.download = `${shelf.shelfCode}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      this.toast.success(`Código QR de ${shelf.shelfCode} descargado como ${shelf.shelfCode}.png`);
    } catch (e: any) {
      this.toast.error('Error al generar código QR: ' + e.message);
    }
  }

  openClearShelfCountsModal(shelf: ShelfAssignmentDto) {
    this.shelfToClearCounts = shelf;
  }

  executeClearShelfCounts() {
    if (!this.shelfToClearCounts) return;
    const shelf = this.shelfToClearCounts;
    this.clearingShelfCounts.set(true);
    this.api.resetShelfAssignment(this.selectedSessionId(), shelf.shelfId, true).subscribe({
      next: () => {
        this.clearingShelfCounts.set(false);
        this.toast.success(`Conteos del anaquel ${shelf.shelfCode} eliminados.`);
        this.shelves.update(list => list.map(s => {
          if (s.shelfId === shelf.shelfId) {
            return {
              ...s,
              totalPieces: 0,
              recordCount: 0,
              status: 'PENDIENTE'
            };
          }
          return s;
        }));
        this.shelfToClearCounts = null;
      },
      error: (err) => {
        this.clearingShelfCounts.set(false);
        this.toast.error(err.error?.message || 'Error al limpiar conteos del anaquel');
      }
    });
  }

  downloadShelfMaterialsZip(shelf: ShelfAssignmentDto) {
    if (!shelf) return;
    this.toast.info(`Generando ZIP de materiales para ${shelf.shelfCode}...`);
    this.api.downloadShelfMaterialsZip(shelf.shelfId, this.selectedSessionId()).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const safeName = shelf.shelfCode.replace(/[\/\\:*?"<>|]/g, '_').trim();
        a.download = `QRs_${safeName}_materiales.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        this.toast.success(`Descargados códigos QR de ${shelf.shelfCode} en ZIP.`);
      },
      error: (err) => {
        this.toast.error('Error al descargar ZIP de materiales: ' + (err.error?.message || err.message));
      }
    });
  }
}
