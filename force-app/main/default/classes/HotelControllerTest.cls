@isTest
public class HotelControllerTest {
    @testSetup
    static void setupData() {
        Account account1 = new Account(
            Name = 'Test Supplier',
            RecordTypeId = Schema.SObjectType.Account.getRecordTypeInfosByName().get('Supplier').getRecordTypeId(),
            CRM_Code__c = 'CRM123',
            TP_Location__c = 'TP1',
            TP_Location_Code__c = 'TPCODE1'
        );
        insert account1;

        CRM__c crm = new CRM__c(
            CODE__c = 'CRM123',
            ADDRESS1__c = 'Test'
        );
        insert crm;

        Quote q = new Quote(
            Name = 'Test Quote',
            TravelStartDate__c = Date.today(),
            TravelEndDate__c = Date.today().addDays(5),
            Quotation_Name__c = 'Destination Name'
        );
        insert q;

        LCL__c lcl = new LCL__c(
            DESCR__c = 'Test Place'
        );
        insert lcl;

        Opt__c opt1 = new Opt__c(
            Service__c = 'AC',
            Supplier__c = 'CRM123',
            Code__c = 'STANBB',
            ExternalId__c = 'CPTACCRM456STANBB',
            Opt_Id__c = 10,
            LCL_Lookup__c = lcl.Id,
            CRM_Lookup__c = crm.Id
        );
        insert opt1;

        Passenger__c adultPassenger = new Passenger__c(
            FirstName__c = 'Adult',
            Last_Name__c = 'Passenger',
            PassengerType__c = 'Adult'
        );

        Passenger__c childPassenger = new Passenger__c(
            FirstName__c = 'Child',
            Last_Name__c = 'Passenger',
            PassengerType__c = 'Child'
        );

        insert new List<Passenger__c>{adultPassenger, childPassenger};

        PassengerQuotationMapping__c adultMapping = new PassengerQuotationMapping__c(
            Passenger__c = adultPassenger.Id,
            Adult_Passenger__c = true,
            Quote__c = q.Id
        );

        PassengerQuotationMapping__c childMapping = new PassengerQuotationMapping__c(
            Passenger__c = childPassenger.Id,
            Child_Passenger_Type__c = true,
            Quote__c = q.Id
        );

        insert new List<PassengerQuotationMapping__c>{adultMapping, childMapping};
    }

    @isTest
    static void testGetOptsByCrmCode() {
        String crmCode = [SELECT CODE__c FROM CRM__c LIMIT 1].CODE__c;

        List<Opt__c> opts = HotelController.getOptsByCrmCode(crmCode);
        System.assertEquals(1, opts.size());
        System.assertEquals('CPTACCRM456STANBB', opts[0].ExternalId__c);
    }

    @isTest
    static void testGetOptByOptCode() {
        String optCode = [SELECT ExternalId__c FROM Opt__c LIMIT 1].ExternalId__c;

        List<Opt__c> opts  = HotelController.getOptByOptCode(optCode);
        System.assertEquals('CPTACCRM456STANBB', opts[0].ExternalId__c);
    }

    @isTest
    static void testGetPassengerTypeCounts() {
        Id qId = [SELECT Id FROM Quote LIMIT 1].Id;
        Map<String, Integer> passangerMap = HotelController.getPassengerTypeCounts(qId);
        System.assertEquals(1, passangerMap.get('Adult'));
    }

    @isTest
    static void testGetHotelsDetails() {
        HotelController.Request req = new HotelController.Request();
        req.city = 'Test';

        List<HotelController.HotelWrapper> hotels = HotelController.getHotelsDetails(new List<HotelController.Request>{req});
        System.assertEquals(1, hotels.size());
        System.assertEquals('CRM123', hotels[0].crmCode);
        System.assertEquals('Test Supplier', hotels[0].hotelName);
    }
}