package com.interflu.inventory.dto;

import java.util.List;

public class CountDto {

    public static class CountRequest {
        private Long sessionId;
        private Long shelfId;
        private String productCode;
        private Double quantity;
        private String mode = "NORMAL"; // NORMAL, ADD, REPLACE, FORCE
        private String notes;
        private String section;
        private String description;

        public Long getSessionId() { return sessionId; }
        public void setSessionId(Long sessionId) { this.sessionId = sessionId; }

        public Long getShelfId() { return shelfId; }
        public void setShelfId(Long shelfId) { this.shelfId = shelfId; }

        public String getProductCode() { return productCode; }
        public void setProductCode(String productCode) { this.productCode = productCode; }

        public Double getQuantity() { return quantity; }
        public void setQuantity(Double quantity) { this.quantity = quantity; }

        public String getMode() { return mode; }
        public void setMode(String mode) { this.mode = mode; }

        public String getNotes() { return notes; }
        public void setNotes(String notes) { this.notes = notes; }

        public String getSection() { return section; }
        public void setSection(String section) { this.section = section; }

        public String getDescription() { return description; }
        public void setDescription(String description) { this.description = description; }
    }

    public static class CheckDuplicateResponse {
        private boolean existsInCatalog;
        private boolean alreadyInCurrentShelf;
        private boolean alreadyInOtherShelves;
        private Double currentShelfQty;
        private Double totalSessionQty;
        private Long existingRecordIdInShelf;
        private String productDescription;
        private String productUnit;
        private Double productStockSaE;
        private List<PreviousLocation> previousLocations;
        private String warningMessage;

        public boolean isExistsInCatalog() { return existsInCatalog; }
        public void setExistsInCatalog(boolean existsInCatalog) { this.existsInCatalog = existsInCatalog; }

        public boolean isAlreadyInCurrentShelf() { return alreadyInCurrentShelf; }
        public void setAlreadyInCurrentShelf(boolean alreadyInCurrentShelf) { this.alreadyInCurrentShelf = alreadyInCurrentShelf; }

        public boolean isAlreadyInOtherShelves() { return alreadyInOtherShelves; }
        public void setAlreadyInOtherShelves(boolean alreadyInOtherShelves) { this.alreadyInOtherShelves = alreadyInOtherShelves; }

        public Double getCurrentShelfQty() { return currentShelfQty; }
        public void setCurrentShelfQty(Double currentShelfQty) { this.currentShelfQty = currentShelfQty; }

        public Double getTotalSessionQty() { return totalSessionQty; }
        public void setTotalSessionQty(Double totalSessionQty) { this.totalSessionQty = totalSessionQty; }

        public Long getExistingRecordIdInShelf() { return existingRecordIdInShelf; }
        public void setExistingRecordIdInShelf(Long existingRecordIdInShelf) { this.existingRecordIdInShelf = existingRecordIdInShelf; }

        public String getProductDescription() { return productDescription; }
        public void setProductDescription(String productDescription) { this.productDescription = productDescription; }

        public String getProductUnit() { return productUnit; }
        public void setProductUnit(String productUnit) { this.productUnit = productUnit; }

        public Double getProductStockSaE() { return productStockSaE; }
        public void setProductStockSaE(Double productStockSaE) { this.productStockSaE = productStockSaE; }

        public List<PreviousLocation> getPreviousLocations() { return previousLocations; }
        public void setPreviousLocations(List<PreviousLocation> previousLocations) { this.previousLocations = previousLocations; }

        public String getWarningMessage() { return warningMessage; }
        public void setWarningMessage(String warningMessage) { this.warningMessage = warningMessage; }
    }

    public static class PreviousLocation {
        private String shelfCode;
        private String shelfZone;
        private Double quantity;
        private String userFullName;
        private String countedAt;

        public PreviousLocation(String shelfCode, String shelfZone, Double quantity, String userFullName, String countedAt) {
            this.shelfCode = shelfCode;
            this.shelfZone = shelfZone;
            this.quantity = quantity;
            this.userFullName = userFullName;
            this.countedAt = countedAt;
        }

        public String getShelfCode() { return shelfCode; }
        public String getShelfZone() { return shelfZone; }
        public Double getQuantity() { return quantity; }
        public String getUserFullName() { return userFullName; }
        public String getCountedAt() { return countedAt; }
    }

    public static class BatchSheetRequest {
        private Long sessionId;
        private Long shelfId;
        private List<BatchRowItem> rows;

        public Long getSessionId() { return sessionId; }
        public void setSessionId(Long sessionId) { this.sessionId = sessionId; }
        public Long getShelfId() { return shelfId; }
        public void setShelfId(Long shelfId) { this.shelfId = shelfId; }
        public List<BatchRowItem> getRows() { return rows; }
        public void setRows(List<BatchRowItem> rows) { this.rows = rows; }
    }

    public static class BatchRowItem {
        private Long id;
        private String code;
        private Double quantity;
        private String notes;
        private String section;
        private String description;

        public Long getId() { return id; }
        public void setId(Long id) { this.id = id; }
        public String getCode() { return code; }
        public void setCode(String code) { this.code = code; }
        public Double getQuantity() { return quantity; }
        public void setQuantity(Double quantity) { this.quantity = quantity; }
        public String getNotes() { return notes; }
        public void setNotes(String notes) { this.notes = notes; }
        public String getSection() { return section; }
        public void setSection(String section) { this.section = section; }
        public String getDescription() { return description; }
        public void setDescription(String description) { this.description = description; }
    }
}
