package com.interflu.inventory.dto;

import java.util.List;

public class SessionDto {

    public static class CreateSessionRequest {
        private String title;
        private String warehouseCode = "1";
        private String warehouseName = "Almacén Principal";
        private String notes;
        private List<Long> shelfIds;

        public String getTitle() { return title; }
        public void setTitle(String title) { this.title = title; }
        public String getWarehouseCode() { return warehouseCode; }
        public void setWarehouseCode(String warehouseCode) { this.warehouseCode = warehouseCode; }
        public String getWarehouseName() { return warehouseName; }
        public void setWarehouseName(String warehouseName) { this.warehouseName = warehouseName; }
        public String getNotes() { return notes; }
        public void setNotes(String notes) { this.notes = notes; }
        public List<Long> getShelfIds() { return shelfIds; }
        public void setShelfIds(List<Long> shelfIds) { this.shelfIds = shelfIds; }
    }

    public static class CloseSessionRequest {
        private boolean success; // true -> CERRADO_EXITO, false -> CERRADO_NO_EXITO
        private String notes;

        public boolean isSuccess() { return success; }
        public void setSuccess(boolean success) { this.success = success; }
        public String getNotes() { return notes; }
        public void setNotes(String notes) { this.notes = notes; }
    }

    public static class ReopenSessionRequest {
        private String reason;

        public String getReason() { return reason; }
        public void setReason(String reason) { this.reason = reason; }
    }

    public static class AssignShelfRequest {
        private Long shelfId;
        private Long userId;

        public Long getShelfId() { return shelfId; }
        public void setShelfId(Long shelfId) { this.shelfId = shelfId; }
        public Long getUserId() { return userId; }
        public void setUserId(Long userId) { this.userId = userId; }
    }
}
