package com.interflu.inventory.dto;

import java.util.List;

public class ValidationDto {

    public static class ValidationSummary {
        private Long sessionId;
        private String folio;
        private String status;
        private long totalRecords;
        private long uniqueProducts;
        private double totalPieces;
        private long pendingShelves;
        private long completedShelves;
        private long inexistentCodesCount;
        private long duplicatesCount;
        private long discrepanciesCount;
        private List<DiscrepancyItem> items;

        public Long getSessionId() { return sessionId; }
        public void setSessionId(Long sessionId) { this.sessionId = sessionId; }
        public String getFolio() { return folio; }
        public void setFolio(String folio) { this.folio = folio; }
        public String getStatus() { return status; }
        public void setStatus(String status) { this.status = status; }
        public long getTotalRecords() { return totalRecords; }
        public void setTotalRecords(long totalRecords) { this.totalRecords = totalRecords; }
        public long getUniqueProducts() { return uniqueProducts; }
        public void setUniqueProducts(long uniqueProducts) { this.uniqueProducts = uniqueProducts; }
        public double getTotalPieces() { return totalPieces; }
        public void setTotalPieces(double totalPieces) { this.totalPieces = totalPieces; }
        public long getPendingShelves() { return pendingShelves; }
        public void setPendingShelves(long pendingShelves) { this.pendingShelves = pendingShelves; }
        public long getCompletedShelves() { return completedShelves; }
        public void setCompletedShelves(long completedShelves) { this.completedShelves = completedShelves; }
        public long getInexistentCodesCount() { return inexistentCodesCount; }
        public void setInexistentCodesCount(long inexistentCodesCount) { this.inexistentCodesCount = inexistentCodesCount; }
        public long getDuplicatesCount() { return duplicatesCount; }
        public void setDuplicatesCount(long duplicatesCount) { this.duplicatesCount = duplicatesCount; }
        public long getDiscrepanciesCount() { return discrepanciesCount; }
        public void setDiscrepanciesCount(long discrepanciesCount) { this.discrepanciesCount = discrepanciesCount; }
        public List<DiscrepancyItem> getItems() { return items; }
        public void setItems(List<DiscrepancyItem> items) { this.items = items; }
    }

    public static class DiscrepancyItem {
        private String code;
        private String description;
        private String unit;
        private boolean existsInCatalog;
        private double countedTotal;
        private Double stockSaE;
        private Double difference;
        private int shelfOccurrences;
        private List<String> shelvesList;
        private String issueType; // OK, SOBRANTE, FALTANTE, MULTI_ANAQUEL, CODIGO_INEXISTENTE

        public String getCode() { return code; }
        public void setCode(String code) { this.code = code; }
        public String getDescription() { return description; }
        public void setDescription(String description) { this.description = description; }
        public String getUnit() { return unit; }
        public void setUnit(String unit) { this.unit = unit; }
        public boolean isExistsInCatalog() { return existsInCatalog; }
        public void setExistsInCatalog(boolean existsInCatalog) { this.existsInCatalog = existsInCatalog; }
        public double getCountedTotal() { return countedTotal; }
        public void setCountedTotal(double countedTotal) { this.countedTotal = countedTotal; }
        public Double getStockSaE() { return stockSaE; }
        public void setStockSaE(Double stockSaE) { this.stockSaE = stockSaE; }
        public Double getDifference() { return difference; }
        public void setDifference(Double difference) { this.difference = difference; }
        public int getShelfOccurrences() { return shelfOccurrences; }
        public void setShelfOccurrences(int shelfOccurrences) { this.shelfOccurrences = shelfOccurrences; }
        public List<String> getShelvesList() { return shelvesList; }
        public void setShelvesList(List<String> shelvesList) { this.shelvesList = shelvesList; }
        public String getIssueType() { return issueType; }
        public void setIssueType(String issueType) { this.issueType = issueType; }
    }
}
