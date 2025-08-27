public with sharing class AvailabilitySearchController {
    public class AvailabilityRequest {
        @AuraEnabled public String serviceType;
        @AuraEnabled public Date startDate;
        @AuraEnabled public Integer durationNights;
        @AuraEnabled public Date endDate;
        @AuraEnabled public Integer quantityRooms;
        @AuraEnabled public String location;
        @AuraEnabled public String starRating;
        @AuraEnabled public String supplierStatus;
        @AuraEnabled public String attractions;
        @AuraEnabled public String liveAvailability;
        @AuraEnabled public String supplierName;
    }

    @AuraEnabled(cacheable=false)
    public static String getOptions(AvailabilityRequest filters) {
        HttpRequest req = new HttpRequest();
        // Named Credential: callout:Tourplan_API + path
        req.setEndpoint('https://rest.synatic.com/roamdev/tourplanapi/get_opts');
        req.setMethod('POST');
        req.setHeader('Content-Type', 'application/json');
        // If the real API expects parameters, add them here (example shown):
        // req.setEndpoint('callout:Tourplan_API/roamdev/tourplanapi/get_opts'
        //     + buildQuery(filters));

        req.setTimeout(20000);

        Http http = new Http();
        HTTPResponse res = http.send(req);

        Integer sc = res.getStatusCode();
        if (sc >= 200 && sc < 300) {
            return res.getBody();
        }
        throw new AuraHandledException('Tourplan call failed: ' + sc + ' ' + res.getStatus());
    }

    // Example helper if the endpoint needs query params later
    private static String buildQuery(AvailabilityRequest f) {
        List<String> parts = new List<String>();
        if (f == null) return '';
        if (f.serviceType != null) parts.add('serviceType=' + EncodingUtil.urlEncode(f.serviceType,'UTF-8'));
        if (f.startDate   != null) parts.add('startDate='   + String.valueOf(f.startDate));
        if (f.durationNights != null) parts.add('duration=' + String.valueOf(f.durationNights));
        if (f.endDate     != null) parts.add('endDate='     + String.valueOf(f.endDate));
        if (f.quantityRooms != null) parts.add('qty='       + String.valueOf(f.quantityRooms));
        if (f.location    != null) parts.add('location='    + EncodingUtil.urlEncode(f.location,'UTF-8'));
        if (!parts.isEmpty()) return '?' + String.join(parts, '&');
        return '';
    }

    @AuraEnabled
    public static List<Account> getSupplier(String supplierName) {
        List<Account> suppliers = [SELECT Id, Name, CRM_Code__c FROM Account WHERE RecordType.Name = 'Supplier' and Name = :supplierName LIMIT 1];

        return suppliers;
    }
}
