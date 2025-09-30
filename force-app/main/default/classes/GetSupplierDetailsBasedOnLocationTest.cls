@isTest
public class GetSupplierDetailsBasedOnLocationTest {
    @TestSetup
    static void setupData() {
        Location__c location = new Location__c(
            Name = 'Test Location',
            Destination_Text__c = 'Safari Destination',
            LOC_Name__c = 'TestLoc',
            Is_Parent__c = true
        );
        insert location;

        Account account1 = new Account(
            Name = 'Test Supplier',
            RecordTypeId = Schema.SObjectType.Account.getRecordTypeInfosByName().get('Supplier').getRecordTypeId(),
            CRM_Code__c = 'CRM123',
            TP_Location__c = 'TP1',
            TP_Location_Code__c = 'TPCODE1',
            Location__c = location.Id
        );
        insert account1;
    }

    @isTest
    static void testGetTravelInformation() {
        Location__c loc = [SELECT Id FROM Location__c WHERE Name = 'Test Location' LIMIT 1];

        GetSupplierDetailsBasedOnLocation.SupplierRequest req = new GetSupplierDetailsBasedOnLocation.SupplierRequest();
        req.LocationId = loc.Id;

        Test.startTest();
        List<GetSupplierDetailsBasedOnLocation.SupplierInformationResponse> responses =
            GetSupplierDetailsBasedOnLocation.getTravelInformation(new List<GetSupplierDetailsBasedOnLocation.SupplierRequest>{ req });
        Test.stopTest();

        System.assertEquals(1, responses.size(), 'Should return one response');
        System.assertEquals(1, responses[0].accounts.size(), 'Should return one supplier account');
        System.assertEquals('Test Supplier', responses[0].accounts[0].Name);
        System.assertEquals('CRM123', responses[0].accounts[0].CRM_Code__c);
    }
}