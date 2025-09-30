public class GetSupplierDetailsBasedOnLocation {

    public class SupplierInformationResponse {
        @InvocableVariable
        public List<Account> accounts;
    }

    public class SupplierRequest {
        @InvocableVariable(required=true)
        public Id LocationId;
    }

    @InvocableMethod(label='Get Supplier Information from Quote')
    public static List<SupplierInformationResponse> getTravelInformation(List<SupplierRequest> requestList) {
        List<SupplierInformationResponse> responses = new List<SupplierInformationResponse>();

        for (SupplierRequest req : requestList) {
            SupplierInformationResponse resp = new SupplierInformationResponse();
            resp.accounts = [SELECT Id, name, RecordType.name, CRM_Code__c, Star_Rating__c, Accommodation_Type__c, Supplier_Activities_Attractions__c, Location__c, Service_Type__c, TP_Location_Code__c, TP_Location__c, Supplier_Rating__c, Supplier_Specials__r.MESSAGE_TEXT__c FROM Account where RecordType.name='Supplier' AND Location__c = :req.LocationId order by Supplier_Rating__c desc];
            responses.add(resp);
        }
        return responses;
    }
}