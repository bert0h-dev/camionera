import { TRIP_STATUS_LABELS, type TripStatus } from '../../lib/types'
import { Badge } from '../../components/ui/Badge'
import { TRIP_STATUS_TONES } from './useTrips'

export function TripStatusBadge({ status }: { status: TripStatus }) {
  return (
    <Badge tone={TRIP_STATUS_TONES[status]} dot>
      {TRIP_STATUS_LABELS[status]}
    </Badge>
  )
}
