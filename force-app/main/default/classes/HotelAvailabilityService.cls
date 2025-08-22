public with sharing class HotelAvailabilityService {

    // ===== DTOs =====
    public class Request {
        @InvocableVariable(required=true) public List<String> hotelNames;
        @InvocableVariable(required=true) public Date startDate;
        @InvocableVariable(required=true) public Date endDate;
        @InvocableVariable(required=true) public Integer numberOfPersons;
        @InvocableVariable(required=true) public Integer numberOfChildren;
        @InvocableVariable(required=true) public Id quoteId;
    }
    public class Response { @InvocableVariable public String availabilityMessage; }

    public class HotelWrapper {
        public String hotelName;
        public Date startDate;
        public Date endDate;
        public Integer numberOfPersons;
        public Integer numberOfChildren;
        public String availability;
        public Id accountId;
        public String crmCode;
        public Id quoteId;
    }

    public class HotelRequestWrapper { public List<Record> records; }
    public class Record {
        public String Opt;
        public Date DateFrom;
        public Date DateTo;
        public String Info;
        public String ButtonName;
        public Integer MaximumOptions;
        public List<RoomConfigWrapper> RoomConfigs;
    }
    public class RoomConfigWrapper { public RoomConfig RoomConfig; }
    public class RoomConfig { public Integer Adults; public Integer Children; public String RoomType; }

    // ===== Entry point =====
    @InvocableMethod(label='Check Hotels Availability & Fire Single Event')
    public static List<Response> checkHotelAvailability(List<Request> requests) {
        List<Response> out = new List<Response>();

        for (Request req : requests) {
            if (req == null || req.hotelNames == null || req.hotelNames.isEmpty()) {
                Response rr = new Response(); rr.availabilityMessage = 'No hotel names supplied.'; out.add(rr); continue;
            }

            // 1) Lookup supplier Accounts + CRM codes
            Map<String, Account> nameToAccount = new Map<String, Account>();
            Set<String> crmCodes = new Set<String>();
            for (Account a : [
                SELECT Id, Name, CRM_Code__c
                FROM Account
                WHERE RecordType.Name = 'Supplier'
                AND Name IN :req.hotelNames
            ]) {
                nameToAccount.put(a.Name != null ? a.Name.toLowerCase() : null, a);
                if (String.isNotBlank(a.CRM_Code__c)) crmCodes.add(a.CRM_Code__c);
            }

            // 2) Pull Opt__c rows for those CRM codes (service AC)
            List<Opt__c> opts = new List<Opt__c>();
            if (!crmCodes.isEmpty()) {
                opts = [
                    SELECT Id, Location__c, Service__c, Supplier__c, Code__c, CRM_Code__c
                    FROM Opt__c
                    WHERE CRM_Code__c IN :crmCodes
                    AND Service__c = 'AC'
                    LIMIT 500
                ];
            }

            // Map CRM => list of FULL Opt codes for posting
            Map<String, List<String>> crmToOptCodes = new Map<String, List<String>>();
            for (Opt__c o : opts) {
                String fullOpt = String.join(
                    new List<String>{ o.Location__c, o.Service__c, o.Supplier__c, o.Code__c }, ''
                );
                if (String.isBlank(fullOpt)) continue;
                List<String> listForCrm = crmToOptCodes.get(o.CRM_Code__c);
                if (listForCrm == null) { listForCrm = new List<String>(); crmToOptCodes.put(o.CRM_Code__c, listForCrm); }
                listForCrm.add(fullOpt);
            }

            // 3) Build the request payload (one combined request for all OPTs)
            HotelRequestWrapper requestWrapper = new HotelRequestWrapper();
            requestWrapper.records = new List<Record>();

            Integer adults = (req.numberOfPersons == null ? 2 : req.numberOfPersons);
            Integer children = (req.numberOfChildren == null ? 0 : req.numberOfChildren);

            // Add one record per OPT code
            for (List<String> codes : crmToOptCodes.values()) {
                for (String code : codes) {
                    Record rec = new Record();
                    rec.Opt = code;                      // FULL OPT code
                    rec.DateFrom = req.startDate;        // serialized as YYYY-MM-DD
                    rec.DateTo   = req.endDate;
                    rec.ButtonName = 'Accommodation';
                    rec.MaximumOptions = 20;
                    rec.Info = 'GIAME';

                    RoomConfigWrapper rcw = new RoomConfigWrapper();
                    rcw.RoomConfig = new RoomConfig();
                    rcw.RoomConfig.Adults = adults;
                    rcw.RoomConfig.Children = children;
                    rcw.RoomConfig.RoomType = 'TW';
                    rec.RoomConfigs = new List<RoomConfigWrapper>{ rcw };

                    requestWrapper.records.add(rec);
                }
            }

            // 4) POST to Synatic
            Set<String> availableCrmCodes = new Set<String>(); // suppliers with availability
            if (!requestWrapper.records.isEmpty()) {
                try {
                    Http http = new Http();
                    HttpRequest hr = new HttpRequest();
                    hr.setEndpoint('https://rest.synatic.com/roamdev/tourplanapi/get_opts');
                    hr.setMethod('POST');
                    hr.setHeader('Content-Type','application/json');
                    hr.setHeader('Accept','application/json');
                    hr.setTimeout(20000);
                    hr.setBody(JSON.serialize(requestWrapper));

                    HttpResponse res = http.send(hr);
                    if (res != null && res.getStatusCode() >= 200 && res.getStatusCode() < 300 && String.isNotBlank(res.getBody())) {
                        // Response shape: { "result": [ <object|null>, ... ] }
                        Object parsed = JSON.deserializeUntyped(res.getBody());
                        List<Object> items = new List<Object>();
                        if (parsed instanceof Map<String,Object>) {
                            Object arr = ((Map<String,Object>)parsed).get('result');
                            if (arr instanceof List<Object>) items = (List<Object>)arr;
                        } else if (parsed instanceof List<Object>) {
                            items = (List<Object>)parsed;
                        }

                        // Build reverse map: OPT code -> CRM code (so we can mark the supplier available)
                        Map<String,String> optToCrm = new Map<String,String>();
                        for (String crm : crmToOptCodes.keySet()) {
                            for (String code : crmToOptCodes.get(crm)) optToCrm.put(code, crm);
                        }

                        // Decide availability per OPT row using "!= -1" rule
                        //Set<String> availableCrmCodes = new Set<String>();

                        // If you have a dynamic room type in your request, use that here.
                        // In your current code it's hardcoded to 'TW'.
                        String requestedRoomType = 'TW';

                        for (Object node : items) { // 'items' is the parsed result array
                            if (!(node instanceof Map<String,Object>)) continue;
                            Map<String,Object> row = (Map<String,Object>)node;

                            String optCode = (String) row.get('Opt');
                            Boolean avail = isRowAvailableByOpt(row, requestedRoomType);

                            if (avail && !String.isBlank(optCode)) {
                                String crm = optToCrm.get(optCode);
                                if (!String.isBlank(crm)) availableCrmCodes.add(crm);
                            }
                        }

                    } else if (res != null) {
                        System.debug(LoggingLevel.ERROR, 'Synatic HTTP ' + res.getStatusCode() + ': ' + res.getBody());
                    }
                } catch (Exception ex) {
                    System.debug(LoggingLevel.ERROR, 'Synatic callout failed: ' + ex.getMessage());
                }
            }

            // 5) Build hotel list + human message (cap to 5)
            List<HotelWrapper> hotelList = new List<HotelWrapper>();
            String msg = 'Results:\n';
            Integer added = 0;

            for (String hotelName : req.hotelNames) {
                if (added >= 5) break;
                Account acc = nameToAccount.get(hotelName != null ? hotelName.toLowerCase() : null);

                if (acc != null) {
                    Boolean isAvail = String.isNotBlank(acc.CRM_Code__c) && availableCrmCodes.contains(acc.CRM_Code__c);

                    HotelWrapper hw = new HotelWrapper();
                    hw.hotelName = hotelName;
                    hw.startDate = req.startDate;
                    hw.endDate = req.endDate;
                    hw.numberOfPersons = req.numberOfPersons;
                    hw.numberOfChildren = req.numberOfChildren;
                    hw.availability = isAvail ? 'Available' : 'Not Available';
                    hw.accountId = acc.Id;
                    hw.crmCode = acc.CRM_Code__c;
                    hw.quoteId = req.quoteId;

                    hotelList.add(hw);
                    msg += 'Hotel: ' + hotelName + ' (AccountId: ' + acc.Id + ') - ' + hw.availability + '\n';
                    added++;
                } else {
                    msg += 'Hotel: ' + hotelName + ' - Skipped (no Account match)\n';
                }
            }

            List<HotelWrapper> availableHotels = new List<HotelWrapper>();
            for (HotelWrapper hw : hotelList) {
                if (hw.availability != null && hw.availability.toLowerCase() == 'available') {
                    availableHotels.add(hw);
                }
            }

            if (!availableHotels.isEmpty()) {
                String payload = JSON.serialize(availableHotels);
                Integer maxLen = Hotel_Availability_Event__e.Hotel_JSON__c.getDescribe().getLength();
                if (payload.length() > maxLen) payload = payload.left(maxLen);

                Database.SaveResult sr = EventBus.publish(
                    new Hotel_Availability_Event__e(Hotel_JSON__c = payload)
                );
                System.debug(sr.isSuccess()
                             ? 'Platform Event published: ' + sr.getId()
                             : 'Platform Event error: ' + (sr.getErrors().isEmpty() ? 'unknown' : sr.getErrors()[0].getMessage()));
            } else {
                System.debug('No available hotels — skipping event publish.');
            }





            Response r = new Response(); r.availabilityMessage = msg; out.add(r);
        }

        return out;
    }


    // Returns true if the specific OPT row is available for the requested room type
    private static Boolean isRowAvailableByOpt(Map<String,Object> row, String requestedRoomType) {
        if (row == null) return false;

        // Navigate: OptDetailedAvails -> OptDetailedAvail -> UnitType / OptAvail
        Map<String,Object> oda = (Map<String,Object>)row.get('OptDetailedAvails');
        if (oda == null) return false;

        Map<String,Object> od = (Map<String,Object>)oda.get('OptDetailedAvail');
        if (od == null) return false;

        String unitTypeStr = (String)od.get('UnitType');   // e.g. "sg db tw tr qd ot"
        String optAvailStr = (String)od.get('OptAvail');   // e.g. "-3 -3 -3 -3"

        if (String.isBlank(unitTypeStr) || String.isBlank(optAvailStr)) return false;

        // Tokenize
        List<String> units = new List<String>();
        for (String t : unitTypeStr.split('\\s+')) if (!String.isBlank(t)) units.add(t.toLowerCase());

        List<String> vals = new List<String>();
        for (String v : optAvailStr.split('\\s+')) if (!String.isBlank(v)) vals.add(v.trim());

        // Find the index for the requested room type (default to TW if none provided)
        String rt = String.isBlank(requestedRoomType) ? 'tw' : requestedRoomType.toLowerCase();
        Integer idx = units.indexOf(rt);

        // If we can align the index, apply the rule: available ⇔ value != -1
        if (idx != -1 && idx < vals.size()) {
            return (vals[idx] != '-1');
        }

        // Fallback: if any value is not -1, treat as available
        for (String v : vals) if (v != '-1') return true;
        return false;
    }

}
