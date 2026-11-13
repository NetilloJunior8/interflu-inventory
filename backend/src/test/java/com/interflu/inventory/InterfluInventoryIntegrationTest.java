package com.interflu.inventory;

import com.interflu.inventory.dto.CountDto;
import com.interflu.inventory.dto.SessionDto;
import com.interflu.inventory.dto.ValidationDto;
import com.interflu.inventory.model.*;
import com.interflu.inventory.repository.*;
import com.interflu.inventory.service.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
public class InterfluInventoryIntegrationTest {

    @Autowired
    private ProductService productService;

    @Autowired
    private ShelfRepository shelfRepo;

    @Autowired
    private InventorySessionRepository sessionRepo;

    @Autowired
    private InventorySessionService sessionService;

    @Autowired
    private CountService countService;

    @Autowired
    private ValidationService validationService;

    @Autowired
    private SaeExportService saeExportService;

    @Autowired
    private UserRepository userRepo;

    @Autowired
    private AuditService auditService;

    @Test
    void testFullInventoryWorkflowAndDuplicateDetection() {
        // 1. Verify Catalog scale (> 22,000 SKUs)
        long totalProducts = productService.countProducts();
        assertTrue(totalProducts >= 22000, "Catalog should have at least 22,000 items, found: " + totalProducts);

        // 2. Benchmark fast search over 22k SKUs
        long t0 = System.currentTimeMillis();
        var searchResults = productService.search("VAL-ESF", false);
        long searchDuration = System.currentTimeMillis() - t0;
        assertFalse(searchResults.isEmpty(), "Search for VAL-ESF should return items");
        assertTrue(searchDuration < 200, "Search in 22,000 items should take < 200ms, took: " + searchDuration + "ms");

        // 3. Verify Users
        User user1 = userRepo.findByUsername("Osiris").orElseThrow();
        User user2 = userRepo.findByUsername("Alexis").orElseThrow();
        assertNotNull(user1);
        assertNotNull(user2);

        // 4. Verify Shelves
        List<Shelf> shelves = shelfRepo.findByActiveTrueOrderByCodeAsc();
        assertFalse(shelves.isEmpty(), "Shelves should be seeded");
        Shelf anqA01 = shelves.get(0);
        Shelf anqB01 = shelves.size() > 2 ? shelves.get(2) : shelves.get(1);

        // 5. Create a new Inventory Session
        SessionDto.CreateSessionRequest createReq = new SessionDto.CreateSessionRequest();
        createReq.setTitle("Inventario Test Piloto Automatizado");
        createReq.setWarehouseCode("1");
        createReq.setNotes("Sesión de prueba de integración");
        InventorySession session = sessionService.createSession(createReq, user1);
        assertNotNull(session.getId());
        assertTrue(session.getFolio().startsWith("INV-"));

        // 6. Test First Capture in ANQ-A01
        String testCode = "VAL-ESF-1/2";
        CountDto.CountRequest req1 = new CountDto.CountRequest();
        req1.setSessionId(session.getId());
        req1.setShelfId(anqA01.getId());
        req1.setProductCode(testCode);
        req1.setQuantity(10.0);
        req1.setMode("NORMAL");
        CountRecord rec1 = countService.saveCount(req1, user2);
        assertEquals(10.0, rec1.getQuantity());

        // 7. Test Duplicate Alert on Same Shelf
        CountDto.CheckDuplicateResponse checkSameShelf = countService.checkDuplicate(session.getId(), anqA01.getId(), testCode, user2);
        assertTrue(checkSameShelf.isAlreadyInCurrentShelf(), "Should detect code already exists in current shelf");
        assertEquals(10.0, checkSameShelf.getCurrentShelfQty());

        // 8. Test Duplicate Mode = ADD (10 + 5 = 15)
        CountDto.CountRequest reqAdd = new CountDto.CountRequest();
        reqAdd.setSessionId(session.getId());
        reqAdd.setShelfId(anqA01.getId());
        reqAdd.setProductCode(testCode);
        reqAdd.setQuantity(5.0);
        reqAdd.setMode("ADD");
        CountRecord recAdd = countService.saveCount(reqAdd, user2);
        assertEquals(15.0, recAdd.getQuantity(), "Quantity should be summed to 15.0");
        assertEquals(10.0, recAdd.getPreviousQuantity(), "Previous quantity should be preserved");

        // 9. Test Multi-Shelf Capture in ANQ-B01
        CountDto.CheckDuplicateResponse checkOtherShelf = countService.checkDuplicate(session.getId(), anqB01.getId(), testCode, user2);
        assertFalse(checkOtherShelf.isAlreadyInCurrentShelf(), "Not yet in ANQ-B01");
        assertTrue(checkOtherShelf.isAlreadyInOtherShelves(), "Should detect it exists in another shelf (ANQ-A01)");

        CountDto.CountRequest reqOther = new CountDto.CountRequest();
        reqOther.setSessionId(session.getId());
        reqOther.setShelfId(anqB01.getId());
        reqOther.setProductCode(testCode);
        reqOther.setQuantity(20.0);
        reqOther.setMode("NORMAL");
        countService.saveCount(reqOther, user2);

        // Total for testCode is now 15 in ANQ-A01 + 20 in ANQ-B01 = 35 pieces
        var checkAfterBoth = countService.checkDuplicate(session.getId(), anqA01.getId(), testCode, user2);
        assertEquals(35.0, checkAfterBoth.getTotalSessionQty(), "Total across all shelves should be 35.0");

        // 10. Test Validation Summary & Discrepancies
        ValidationDto.ValidationSummary summary = validationService.validateSession(session.getId());
        assertEquals(session.getFolio(), summary.getFolio());
        assertTrue(summary.getTotalPieces() >= 35.0);

        // 11. Test SAE Export (CSV and TXT)
        SaeExportService.ExportResult csvResult = saeExportService.generateExport(session.getId(), "CSV", "IMPORT", user1);
        assertNotNull(csvResult.getContent());
        String csvText = new String(csvResult.getContent());
        assertTrue(csvText.contains("CVE_ART,ALMACEN,CANTIDAD"), "CSV must include Aspel SAE headers");
        assertTrue(csvText.contains(testCode), "CSV must include the counted product code");

        SaeExportService.ExportResult txtResult = saeExportService.generateExport(session.getId(), "TXT", "IMPORT", user1);
        String txtText = new String(txtResult.getContent());
        assertTrue(txtText.contains("CVE_ART\tALMACEN\tCANTIDAD"), "TXT must be tab-delimited for Aspel SAE");

        // 12. Test Closing with Success and Reopening with Justification
        SessionDto.CloseSessionRequest closeReq = new SessionDto.CloseSessionRequest();
        closeReq.setSuccess(true);
        closeReq.setNotes("Piloto completado sin observaciones.");
        InventorySession closed = sessionService.closeSession(session.getId(), closeReq, user1);
        assertEquals(InventorySession.Status.CERRADO_EXITO, closed.getStatus());

        // Modifying counts during closed state must fail
        assertThrows(IllegalStateException.class, () -> countService.saveCount(reqAdd, user2));

        // Reopen session with audit note
        SessionDto.ReopenSessionRequest reopenReq = new SessionDto.ReopenSessionRequest();
        reopenReq.setReason("Reapertura autorizada por supervisor para recontar gaveta de sellos.");
        InventorySession reopened = sessionService.reopenSession(session.getId(), reopenReq, user1);
        assertEquals(InventorySession.Status.REABIERTO, reopened.getStatus());
        assertEquals("Reapertura autorizada por supervisor para recontar gaveta de sellos.", reopened.getReopenReason());

        // Verify audit log entries
        var logs = auditService.getLogsBySession(session.getId(), 20);
        assertFalse(logs.isEmpty(), "Audit log should have recorded all session events");
    }
}
