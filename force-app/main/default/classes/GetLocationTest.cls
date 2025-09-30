@isTest
public class GetLocationTest {
    @TestSetup
    static void setupData() {
        Location__c ferretLocation = new Location__c(
        	Name = 'FerretDestination',
            Destination_Text__c = 'Ferret Destination',
            LOC_Name__c = 'FerretLocName',
            Tour_Plan_Location_Name__c = 'TPLocFerret',
            Is_Parent__c = true
        );
        insert ferretLocation;
        
        Location__c childLocation = new Location__c(
            Name = 'ChildLoc',
            Destination_Text__c = 'Child Destination',
            LOC_Name__c = 'ChildLocName',
            Tour_Plan_Location_Name__c = 'TPLocChild',
            Is_Parent__c = false,
            Location__c = ferretLocation.Id
        );
        insert childLocation;
    }

    @isTest
    static void testGetLocationInformation() {
        GetLocation.LocationRequest req = new GetLocation.LocationRequest();
        req.place = 'AnyPlace';

        List<GetLocation.LocationResponse> responses = GetLocation.getLocationInformation(new List<GetLocation.LocationRequest>{ req });

        System.assertEquals(1, responses.size());
        System.assert(responses[0].locations.size() > 0);

        GetLocation.LocationResponseData data = responses[0].locations[0];
        System.assertNotEquals(null, data.recordId);
        System.assertEquals('Ferret Destination', data.DestinationText);
    }
}