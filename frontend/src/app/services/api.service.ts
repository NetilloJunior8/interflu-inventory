import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface ProductDto {
  id: number;
  code: string;
  description: string;
  unit: string;
  line: string;
  locationSaE?: string;
  stockSaE?: number;
}

export interface ShelfDto {
  id: number;
  code: string;
  zone: string;
  description: string;
  warehouseCode: string;
  plant: string;
  posX: number;
  posY: number;
  width: number;
  height: number;
  active: boolean;
}

export interface ShelfAssignmentDto {
  assignmentId: number;
  shelfId: number;
  shelfCode: string;
  shelfZone: string;
  shelfDescription: string;
  plant: string;
  posX: number;
  posY: number;
  width: number;
  height: number;
  status: 'PENDIENTE' | 'EN_CONTEO' | 'COMPLETADO';
  assignedUserId?: number;
  assignedUserName: string;
  recordCount: number;
  totalPieces: number;
}

export interface InventorySessionSummary {
  id: number;
  folio: string;
  title: string;
  warehouseCode: string;
  warehouseName: string;
  status: 'BORRADOR' | 'EN_CONTEO' | 'POR_VALIDAR' | 'CERRADO_EXITO' | 'CERRADO_NO_EXITO' | 'REABIERTO';
  isEditable: boolean;
  notes?: string;
  createdAt: string;
  createdByName?: string;
  closedAt?: string;
  closedByName?: string;
  closeNotes?: string;
  reopenedAt?: string;
  reopenedByName?: string;
  reopenReason?: string;
  totalRecords: number;
  totalPieces: number;
  distinctCodes: number;
  totalShelves: number;
  completedShelves: number;
  progressPercent: number;
  pbTotal?: number;
  pbCompleted?: number;
  pbPercent?: number;
  paTotal?: number;
  paCompleted?: number;
  paPercent?: number;
}

export interface DuplicateCheckResult {
  existsInCatalog: boolean;
  alreadyInCurrentShelf: boolean;
  alreadyInOtherShelves: boolean;
  currentShelfQty?: number;
  totalSessionQty?: number;
  existingRecordIdInShelf?: number;
  productDescription: string;
  productUnit: string;
  productStockSaE?: number;
  previousLocations?: Array<{
    shelfCode: string;
    shelfZone: string;
    quantity: number;
    userFullName: string;
    countedAt: string;
  }>;
  warningMessage?: string;
}

export interface CountRecordDto {
  id: number;
  sessionId: number;
  shelfId: number;
  shelfCode: string;
  shelfZone: string;
  capturedCode: string;
  description: string;
  unit: string;
  existsInCatalog: boolean;
  quantity: number;
  previousQuantity?: number;
  stockSaE?: number;
  userName: string;
  validationStatus: string;
  notes?: string;
  countedAt: string;
  updatedAt: string;
}

export interface DiscrepancyItem {
  code: string;
  description: string;
  unit: string;
  existsInCatalog: boolean;
  countedTotal: number;
  stockSaE?: number;
  difference?: number;
  shelfOccurrences: number;
  shelvesList: string[];
  issueType: 'OK' | 'SOBRANTE' | 'FALTANTE' | 'MULTI_ANAQUEL_OK' | 'CODIGO_INEXISTENTE';
}

export interface ValidationSummaryDto {
  sessionId: number;
  folio: string;
  status: string;
  totalRecords: number;
  uniqueProducts: number;
  totalPieces: number;
  pendingShelves: number;
  completedShelves: number;
  inexistentCodesCount: number;
  duplicatesCount: number;
  discrepanciesCount: number;
  items: DiscrepancyItem[];
}

export interface SaeExportLogDto {
  id: number;
  session: { id: number; folio: string };
  format: string;
  fileName: string;
  totalRows: number;
  importStatus: 'GENERADO' | 'IMPORTADO_EXITO' | 'IMPORTADO_CON_ERROR';
  reconciliationNotes?: string;
  exportedBy?: { fullName: string };
  exportedAt: string;
  reconciledAt?: string;
}

export interface AuditLogDto {
  id: number;
  sessionId?: number;
  sessionFolio?: string;
  username: string;
  userFullName: string;
  action: string;
  entityName: string;
  entityId?: number;
  oldValue?: string;
  newValue?: string;
  details: string;
  timestamp: string;
}

export interface UserSummary {
  id: number;
  username: string;
  fullName: string;
}

export interface SupportTicketDto {
  id: number;
  folio: string;
  authorUsername: string;
  authorFullName: string;
  category: string;
  subject: string;
  description: string;
  status: 'PENDIENTE' | 'EN_ATENCION' | 'RESUELTO';
  priority: 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA';
  adminNotes?: string;
  assignedAdmin?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface AdminUserDto {
  id: number;
  username: string;
  fullName: string;
  role: 'OPERADOR' | 'SISTEMAS';
  active: boolean;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly baseUrl = '/api';

  constructor(private http: HttpClient) {}

  // Sessions
  getSessions(): Observable<InventorySessionSummary[]> {
    return this.http.get<InventorySessionSummary[]>(`${this.baseUrl}/sessions`);
  }

  createSession(payload: { title: string; warehouseCode?: string; notes?: string; shelfIds?: number[] }): Observable<any> {
    return this.http.post(`${this.baseUrl}/sessions`, payload);
  }

  closeSession(id: number, success: boolean, notes: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/sessions/${id}/close`, { success, notes });
  }

  reopenSession(id: number, reason: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/sessions/${id}/reopen`, { reason });
  }

  updateSessionStatus(id: number, status: string, notes: string = ''): Observable<any> {
    return this.http.post(`${this.baseUrl}/sessions/${id}/status`, { status, notes });
  }

  deleteSession(id: number): Observable<any> {
    return this.http.delete(`${this.baseUrl}/sessions/${id}`);
  }

  getSessionShelves(sessionId: number): Observable<ShelfAssignmentDto[]> {
    return this.http.get<ShelfAssignmentDto[]>(`${this.baseUrl}/sessions/${sessionId}/shelves`);
  }

  assignShelf(sessionId: number, shelfId: number, userId: number | null): Observable<any> {
    return this.http.post(`${this.baseUrl}/sessions/${sessionId}/shelves/assign`, { shelfId, userId });
  }

  updateShelfStatus(sessionId: number, shelfId: number, status: 'PENDIENTE' | 'EN_CONTEO' | 'COMPLETADO'): Observable<any> {
    return this.http.post(`${this.baseUrl}/sessions/${sessionId}/shelves/${shelfId}/status`, { status });
  }

  resetShelfAssignment(sessionId: number, shelfId: number, clearRecords: boolean = false): Observable<any> {
    return this.http.post(`${this.baseUrl}/sessions/${sessionId}/shelves/${shelfId}/reset`, { clearRecords });
  }

  // Products
  searchProducts(query: string): Observable<ProductDto[]> {
    return this.http.get<ProductDto[]>(`${this.baseUrl}/products/search`, { params: { q: query } });
  }

  getProductByCode(code: string): Observable<ProductDto> {
    return this.http.get<ProductDto>(`${this.baseUrl}/products/by-code`, { params: { code } });
  }

  getProductCount(): Observable<{ total: number }> {
    return this.http.get<{ total: number }>(`${this.baseUrl}/products/count`);
  }

  // Shelves & Croquis
  getShelves(plant?: string): Observable<ShelfDto[]> {
    const params: any = {};
    if (plant) params.plant = plant;
    return this.http.get<ShelfDto[]>(`${this.baseUrl}/shelves`, { params });
  }

  createShelf(shelf: { code: string; zone: string; description?: string; warehouseCode?: string; plant?: string; posX?: number; posY?: number }): Observable<ShelfDto> {
    return this.http.post<ShelfDto>(`${this.baseUrl}/shelves`, shelf);
  }

  updateShelf(shelfId: number, data: { code?: string; zone?: string; description?: string; plant?: string; warehouseCode?: string }): Observable<ShelfDto> {
    return this.http.put<ShelfDto>(`${this.baseUrl}/shelves/${shelfId}`, data);
  }

  updateShelfLayout(shelfId: number, layout: { posX?: number; posY?: number; width?: number; height?: number; plant?: string }): Observable<any> {
    return this.http.put(`${this.baseUrl}/shelves/${shelfId}/layout`, layout);
  }

  batchUpdateShelfLayout(items: Array<{ id: number; posX?: number; posY?: number; width?: number; height?: number; plant?: string }>): Observable<any> {
    return this.http.put(`${this.baseUrl}/shelves/batch-layout`, items);
  }

  saveCroquisLayout(payload: { positions: Array<{ shelfId: number; posX?: number; posY?: number; width?: number; height?: number }> }): Observable<any> {
    const items = payload.positions.map(p => ({
      id: p.shelfId,
      posX: p.posX,
      posY: p.posY,
      width: p.width,
      height: p.height
    }));
    return this.batchUpdateShelfLayout(items);
  }

  // Counts
  checkDuplicate(sessionId: number, shelfId: number, code: string): Observable<DuplicateCheckResult> {
    return this.http.get<DuplicateCheckResult>(`${this.baseUrl}/counts/check-duplicate`, {
      params: { sessionId, shelfId, code }
    });
  }

  saveCount(payload: {
    sessionId: number;
    shelfId: number;
    productCode: string;
    quantity: number;
    mode?: string;
    notes?: string;
  }): Observable<CountRecordDto> {
    return this.http.post<CountRecordDto>(`${this.baseUrl}/counts`, payload);
  }

  batchSaveSheet(payload: {
    sessionId: number;
    shelfId: number;
    rows: Array<{ id?: number; code: string; quantity: number; notes?: string }>;
  }): Observable<CountRecordDto[]> {
    return this.http.post<CountRecordDto[]>(`${this.baseUrl}/counts/batch-sheet`, payload);
  }

  importExcelCounts(sessionId: number, file: File, shelfId?: number): Observable<{ importedRecords: number; totalPieces: number; shelvesUpdated: number; affectedShelves?: string[] }> {
    const formData = new FormData();
    formData.append('sessionId', String(sessionId));
    if (shelfId) formData.append('shelfId', String(shelfId));
    formData.append('file', file);
    return this.http.post<{ importedRecords: number; totalPieces: number; shelvesUpdated: number; affectedShelves?: string[] }>(`${this.baseUrl}/counts/import-excel`, formData);
  }

  getCounts(sessionId: number, shelfId?: number): Observable<CountRecordDto[]> {
    const params: any = { sessionId };
    if (shelfId) params.shelfId = shelfId;
    return this.http.get<CountRecordDto[]>(`${this.baseUrl}/counts`, { params });
  }

  deleteCount(id: number): Observable<any> {
    return this.http.delete(`${this.baseUrl}/counts/${id}`);
  }

  clearSessionCounts(sessionId: number): Observable<{ deletedCount: number; deletedPieces: number; message: string }> {
    return this.http.delete<{ deletedCount: number; deletedPieces: number; message: string }>(`${this.baseUrl}/counts/session/${sessionId}`);
  }

  // Material QR Downloads
  downloadMaterialQrBlob(code: string): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/qr/material/${encodeURIComponent(code)}`, {
      responseType: 'blob'
    });
  }

  downloadShelfMaterialsZip(shelfId: number, sessionId: number): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/qr/shelf/${shelfId}/materials-zip`, {
      params: { sessionId },
      responseType: 'blob'
    });
  }

  downloadSessionMaterialsBatchZip(sessionId: number): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/qr/session/${sessionId}/materials-batch-zip`, {
      responseType: 'blob'
    });
  }

  // Validation
  getValidationSummary(sessionId: number): Observable<ValidationSummaryDto> {
    return this.http.get<ValidationSummaryDto>(`${this.baseUrl}/validation/${sessionId}`);
  }

  // Dashboard Stats Excel Export
  downloadDashboardStatsExcel(sessionId: number): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/sessions/${sessionId}/export-stats-excel`, {
      responseType: 'blob'
    });
  }

  // SAE Export
  downloadSaeExport(sessionId: number, format: 'EXCEL' | 'CSV' | 'TXT' = 'EXCEL', layout: 'IMPORT' | 'EXISTENCIA_FISICA' | 'RECONCILIACION' = 'EXISTENCIA_FISICA', shelfId?: number): Observable<Blob> {
    const params: any = { format, layout };
    if (shelfId && shelfId > 0) params.shelfId = shelfId;
    return this.http.get(`${this.baseUrl}/export/sae/${sessionId}`, {
      params,
      responseType: 'blob'
    });
  }

  getExportHistory(sessionId?: number): Observable<SaeExportLogDto[]> {
    const params: any = {};
    if (sessionId) params.sessionId = sessionId;
    return this.http.get<SaeExportLogDto[]>(`${this.baseUrl}/export/history`, { params });
  }

  updateExportStatus(exportId: number, status: 'IMPORTADO_EXITO' | 'IMPORTADO_CON_ERROR', notes: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/export/${exportId}/status`, { status, notes });
  }

  // Audit
  getAuditLogs(sessionId?: number, limit = 100): Observable<AuditLogDto[]> {
    const params: any = { limit };
    if (sessionId) params.sessionId = sessionId;
    return this.http.get<AuditLogDto[]>(`${this.baseUrl}/audit`, { params });
  }

  // Users
  getUsers(): Observable<UserSummary[]> {
    return this.http.get<UserSummary[]>(`${this.baseUrl}/auth/users`);
  }

  createUser(user: { username: string; password: string; fullName: string }): Observable<any> {
    return this.http.post(`${this.baseUrl}/auth/users`, user);
  }

  // Support Tickets
  getSupportTickets(status?: string): Observable<SupportTicketDto[]> {
    const params: any = {};
    if (status) params.status = status;
    return this.http.get<SupportTicketDto[]>(`${this.baseUrl}/support/tickets`, { params });
  }

  createSupportTicket(ticket: { category: string; subject: string; description: string; priority?: string }): Observable<SupportTicketDto> {
    return this.http.post<SupportTicketDto>(`${this.baseUrl}/support/tickets`, ticket);
  }

  updateSupportTicketStatus(id: number, payload: { status: string; adminNotes?: string }): Observable<SupportTicketDto> {
    return this.http.put<SupportTicketDto>(`${this.baseUrl}/support/tickets/${id}/status`, payload);
  }

  // Admin User Management
  getAdminUsers(): Observable<AdminUserDto[]> {
    return this.http.get<AdminUserDto[]>(`${this.baseUrl}/admin/users`);
  }

  createAdminUser(user: { username: string; password: string; fullName: string; role?: string }): Observable<AdminUserDto> {
    return this.http.post<AdminUserDto>(`${this.baseUrl}/admin/users`, user);
  }

  changeUserPassword(id: number, newPassword: string): Observable<any> {
    return this.http.put(`${this.baseUrl}/admin/users/${id}/password`, { newPassword });
  }

  toggleUserActive(id: number): Observable<AdminUserDto> {
    return this.http.put<AdminUserDto>(`${this.baseUrl}/admin/users/${id}/toggle-active`, {});
  }

  deleteAdminUser(id: number): Observable<any> {
    return this.http.delete(`${this.baseUrl}/admin/users/${id}`);
  }
}
