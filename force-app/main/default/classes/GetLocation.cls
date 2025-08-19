public class GetLocation {
    public class LocationResponseData {
        @InvocableVariable
        public Id recordId;
        
        @InvocableVariable
        public String DestinationText;
    }
    
	public class LocationResponse {
        @InvocableVariable
        public List<LocationResponseData> locations;
    }

    public class LocationRequest {
        @InvocableVariable(required=true)
        public String place;
    }
    
    @InvocableMethod(label='Get Locations')
    public static List<LocationResponse> getLocationInformation(List<LocationRequest> requestList) {
        List<LocationResponse> responses = new List<LocationResponse>();
        
        List<Location__c> locs = [SELECT Id, Destination_Text__c, LOC_Name__c, Location__c FROM Location__c WHERE Is_Parent__c = True];
        
        // For each request, create a response
        for (LocationRequest req : requestList) {
            LocationResponse response = new LocationResponse();
            response.locations = new List<LocationResponseData>();

            if (locs.size() > 0) {
                for (Location__c loc : locs) {
                    LocationResponseData data = new LocationResponseData();
                    data.recordId = loc.Id;
                    data.DestinationText = loc.Destination_Text__c;
                    response.locations.add(data);
                }
            }

            responses.add(response);
        }
        return responses;
    }
}